/**
 * Pace-aware, team-preferring doctor selection for shift assignment.
 *
 * The algorithm computes a "paceGap" for each candidate — how far behind
 * their expected schedule they are, given target shifts and remaining
 * available days. Doctors with upcoming leave fall behind faster and
 * get prioritized automatically.
 *
 * Hard partition: under-target doctors always preferred over met-target.
 * Within each group, team cohesion is preferred when paceGaps are similar.
 */

import type { DoctorWithTeam } from '@/types/scheduling';
import type { EngineContext } from './constants';
import { SCHEDULING_CONSTANTS } from './constants';
import { getDaysInMonth, utcMs } from './calendar-utils';
import { canDoctorWork, isDoctorOnLeave, isDoctorOnBridgeDay } from './constraints';

/** Threshold for preferring same-team doctors over higher-priority candidates. */
const TEAM_GAP_THRESHOLD = 1.5;

/** Penalty weight when a future day would be understaffed due to rest blocking. */
const LOOKAHEAD_PENALTY_WEIGHT = 5;

/** Bonus for night shifts that continue a day→night rotation pattern. */
const CONTINUATION_BONUS = 10;

/**
 * Penalty weight for extra-shift equalization.
 * Doctors who have more extra shifts (beyond base norm) than the average
 * are penalized proportionally, so extra work is distributed fairly.
 */
const EXTRA_SHIFT_EQUALIZATION_WEIGHT = 3;

/**
 * Look-ahead: compute a penalty for assigning this doctor to a shift today.
 * If their mandatory rest would block them on a future day that's already
 * tight on availability, we penalise so the algorithm prefers other doctors.
 *
 * For days at offset >= 2, the raw availability from canDoctorWork() doesn't
 * account for intermediate days' assignments (which haven't happened yet).
 * We compensate by subtracting the expected consumption of those intermediate
 * days: each intermediate day will assign shiftsPerNight night-shift doctors
 * (blocked 48h -> unavailable next day) and shiftsPerDay day-shift doctors
 * (blocked 24h -> unavailable for next day's day shift).
 */
export function getLookaheadPenalty(
  ctx: EngineContext,
  candidate: DoctorWithTeam,
  currentDate: Date,
  shiftType: 'day' | 'night',
): number {
  const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
  const currentDay = currentDate.getDate();

  const restHours = shiftType === 'night'
    ? SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST
    : SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
  const shiftEndMs = shiftType === 'day'
    ? utcMs(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 20)
    : utcMs(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1, 8);
  const restEndTime = shiftEndMs + restHours * 60 * 60 * 1000;

  let penalty = 0;

  for (let offset = 1; offset <= 3; offset++) {
    const futureDay = currentDay + offset;
    if (futureDay > daysInMonth) continue;

    const futureDate = new Date(ctx.year, ctx.month, futureDay);

    const dayShiftStartMs = utcMs(futureDate.getFullYear(), futureDate.getMonth(), futureDate.getDate(), 8);
    const nightShiftStartMs = utcMs(futureDate.getFullYear(), futureDate.getMonth(), futureDate.getDate(), 20);

    const blockedForDay = dayShiftStartMs < restEndTime;
    const blockedForNight = nightShiftStartMs < restEndTime;

    if (!blockedForDay && !blockedForNight) continue;

    let availForDay = 0;
    let availForNight = 0;
    for (const doc of ctx.doctors) {
      if (doc.id === candidate.id) continue;
      if (isDoctorOnLeave(ctx, doc.id, futureDate)) continue;
      if (isDoctorOnBridgeDay(ctx, doc.id, futureDate)) continue;
      if (canDoctorWork(ctx, doc, futureDate, 'day')) availForDay++;
      if (canDoctorWork(ctx, doc, futureDate, 'night')) availForNight++;
    }

    // For offset >= 2, account for intermediate days' future assignments.
    if (offset >= 2) {
      const intermediateDays = offset - 1;
      availForDay -= ctx.shiftsPerNight * intermediateDays;
      availForNight -= ctx.shiftsPerNight * intermediateDays;
      availForDay -= ctx.shiftsPerDay * intermediateDays;
    }

    const margin = offset >= 2 ? 2 : 1;
    if (blockedForDay && availForDay < ctx.shiftsPerDay + margin) {
      penalty += LOOKAHEAD_PENALTY_WEIGHT;
    }
    if (blockedForNight && availForNight < ctx.shiftsPerNight + margin) {
      penalty += LOOKAHEAD_PENALTY_WEIGHT;
    }
  }

  return penalty;
}

export function selectDoctorsForShift(
  ctx: EngineContext,
  doctorsByTeam: Map<string, DoctorWithTeam[]>,
  floatingDoctors: DoctorWithTeam[],
  teamIds: string[],
  currentDate: Date,
  shiftType: 'day' | 'night',
  slotsNeeded: number,
  doctorTargetShifts: Map<string, number>,
  doctorTotalAvailDays: Map<string, number>,
  doctorElapsedAvailDays: Map<string, number>
): DoctorWithTeam[] {
  interface Candidate {
    doc: DoctorWithTeam;
    paceGap: number;
    underTarget: boolean;
    lookaheadPenalty: number;
    continuationBonus: number;
    extraShiftPenalty: number;
  }

  const candidates: Candidate[] = [];

  // Compute average total shifts across all doctors for equalization.
  // Using total shifts (not "extra beyond target") ensures the penalty
  // is active even while doctors are still underTarget — preventing
  // some doctors from accumulating too many shifts early on.
  let totalShiftsSum = 0;
  let doctorCount = 0;
  for (const doc of ctx.doctors) {
    totalShiftsSum += ctx.doctorShiftCount.get(doc.id) || 0;
    doctorCount++;
  }
  const avgShifts = doctorCount > 0 ? totalShiftsSum / doctorCount : 0;

  const consider = (doc: DoctorWithTeam) => {
    if (!canDoctorWork(ctx, doc, currentDate, shiftType)) return;

    const target = doctorTargetShifts.get(doc.id) || 0;
    const current = ctx.doctorShiftCount.get(doc.id) || 0;
    const totalAvail = doctorTotalAvailDays.get(doc.id) || 1;
    const elapsedAvail = doctorElapsedAvailDays.get(doc.id) || 1;

    const expectedByNow = target * (elapsedAvail / totalAvail);
    const paceGap = expectedByNow - current;

    const lookaheadPenalty = getLookaheadPenalty(ctx, doc, currentDate, shiftType);

    // Penalize doctors who have more total shifts than average.
    // This is active even for underTarget doctors, preventing early accumulation.
    const extraShiftPenalty = (current - avgShifts) * EXTRA_SHIFT_EQUALIZATION_WEIGHT;

    let continuationBonus = 0;
    if (shiftType === 'night') {
      const lastShift = ctx.doctorLastShift.get(doc.id);
      if (lastShift && lastShift.type === 'day') {
        const yesterday = currentDate.getDate() - 1;
        if (lastShift.date.getDate() === yesterday &&
            lastShift.date.getMonth() === currentDate.getMonth() &&
            lastShift.date.getFullYear() === currentDate.getFullYear()) {
          continuationBonus = CONTINUATION_BONUS;
        }
      }
    }

    candidates.push({ doc, paceGap, underTarget: current < target, lookaheadPenalty, continuationBonus, extraShiftPenalty });
  };

  for (const teamId of teamIds) {
    for (const doc of doctorsByTeam.get(teamId) || []) consider(doc);
  }
  for (const doc of floatingDoctors) consider(doc);

  const sortByScore = (a: Candidate, b: Candidate) =>
    (b.paceGap - b.lookaheadPenalty + b.continuationBonus - b.extraShiftPenalty) -
    (a.paceGap - a.lookaheadPenalty + a.continuationBonus - a.extraShiftPenalty);

  const underTarget = candidates
    .filter(c => c.underTarget)
    .sort(sortByScore);
  const metTarget = candidates
    .filter(c => !c.underTarget)
    .sort(sortByScore);

  const pool = [...underTarget, ...metTarget];
  if (pool.length === 0) return [];

  const selected: DoctorWithTeam[] = [];
  const usedIds = new Set<string>();

  for (let slot = 0; slot < slotsNeeded; slot++) {
    const remaining = pool.filter(c => !usedIds.has(c.doc.id));
    if (remaining.length === 0) break;

    if (selected.length === 0) {
      selected.push(remaining[0].doc);
      usedIds.add(remaining[0].doc.id);
    } else {
      const selectedTeams = new Set(selected.map(d => d.team_id).filter(Boolean));
      const bestGap = remaining[0].paceGap;

      let pick: Candidate | undefined;
      for (const c of remaining) {
        if (bestGap - c.paceGap > TEAM_GAP_THRESHOLD) break;
        if (c.doc.team_id && selectedTeams.has(c.doc.team_id)) {
          pick = c;
          break;
        }
      }

      const chosen = pick || remaining[0];
      selected.push(chosen.doc);
      usedIds.add(chosen.doc.id);
    }
  }

  return selected;
}
