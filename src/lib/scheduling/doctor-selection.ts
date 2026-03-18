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
import { wouldBlockNextCadence } from './cadence';

/** Threshold for preferring same-team doctors over higher-priority candidates. */
const TEAM_GAP_THRESHOLD = 1.5;

/** Penalty weight when a future day would be understaffed due to rest blocking. */
const LOOKAHEAD_PENALTY_WEIGHT = 5;

/** Bonus for night shifts that continue a day→night rotation pattern. */
const CONTINUATION_BONUS = 3;

/** Bonus for doctors whose cadence matches the current shift type. */
const CADENCE_ON_DUTY_BONUS = 8;

/** Penalty for assignments that would break the doctor's next cadence shift. */
const CADENCE_BREAK_PENALTY = 8;

/**
 * Penalty weight for extra-shift equalization.
 * Doctors who have more extra shifts (beyond base norm) than the average
 * are penalized proportionally, so extra work is distributed fairly.
 */
const EXTRA_SHIFT_EQUALIZATION_WEIGHT = 5;

/**
 * Bonus weight for rest overlap with leave/bridge days.
 * Prefer candidates whose mandatory rest period falls on days they can't
 * work anyway (leave/bridge/month boundary), so the rest is "free".
 */
const REST_OVERLAP_WEIGHT = 3;

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
      if (doc.shift_mode === '24h') continue; // 24h doctors don't fill 12h slots
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
    availForDay = Math.max(0, availForDay);
    availForNight = Math.max(0, availForNight);

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
  doctorElapsedAvailDays: Map<string, number>,
  excludeIds: Set<string> = new Set(),
  daysInMonth: number = 0,
): DoctorWithTeam[] {
  interface Candidate {
    doc: DoctorWithTeam;
    paceGap: number;
    underTarget: boolean;
    lookaheadPenalty: number;
    continuationBonus: number;
    extraShiftPenalty: number;
    restOverlapBonus: number;
    cadenceOnDutyBonus: number;
    cadenceBreakPenalty: number;
    perturbation: number;
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

  const effectiveDaysInMonth = daysInMonth || getDaysInMonth(ctx.year, ctx.month);

  // Compute tightness-based cadence scaling: on tight days (few available
  // 12h doctors), reduce cadence bonuses/penalties so coverage takes priority.
  let availToday = 0;
  for (const teamId of teamIds) {
    for (const doc of doctorsByTeam.get(teamId) || []) {
      if (!excludeIds.has(doc.id) && canDoctorWork(ctx, doc, currentDate, shiftType)) availToday++;
    }
  }
  for (const doc of floatingDoctors) {
    if (!excludeIds.has(doc.id) && canDoctorWork(ctx, doc, currentDate, shiftType)) availToday++;
  }
  const isTight = availToday < (ctx.shiftsPerDay + ctx.shiftsPerNight + 2);
  const cadenceScale = isTight ? 0.3 : 1.0;

  const consider = (doc: DoctorWithTeam) => {
    if (excludeIds.has(doc.id)) return;
    if (!canDoctorWork(ctx, doc, currentDate, shiftType)) return;

    const target = doctorTargetShifts.get(doc.id) || 0;
    const current = ctx.doctorShiftCount.get(doc.id) || 0;

    // Cadence scoring: bonus for on-duty, penalty for blocking next cadence.
    // Scale down cadence bonus when doctor is above average to prevent over-accumulation.
    // Also scale down on tight days where coverage matters more than cadence.
    let cadenceOnDutyBonus = 0;
    let cadenceBreakPenalty = 0;
    const docCadence = ctx.doctorCadence.get(doc.id);
    if (docCadence) {
      const cadenceType = docCadence.get(currentDate.getDate());
      if (cadenceType === shiftType) {
        const shiftsAboveAvg = current - avgShifts;
        if (shiftsAboveAvg <= 0) {
          cadenceOnDutyBonus = CADENCE_ON_DUTY_BONUS * cadenceScale;
        } else if (shiftsAboveAvg < 2) {
          cadenceOnDutyBonus = CADENCE_ON_DUTY_BONUS * cadenceScale * (1 - shiftsAboveAvg / 2);
        }
        // else: >2 shifts above avg → no cadence bonus
      }
      if (wouldBlockNextCadence(ctx.year, ctx.month, currentDate.getDate(), shiftType, docCadence, effectiveDaysInMonth)) {
        cadenceBreakPenalty = CADENCE_BREAK_PENALTY * cadenceScale;
      }
    }
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

    // Rest overlap bonus: prefer candidates whose mandatory rest period
    // falls on days they can't work anyway (leave/bridge/month boundary).
    const daysInMo = getDaysInMonth(ctx.year, ctx.month);
    let restOverlapBonus = 0;
    if (shiftType === 'night') {
      // Night shift → 48h rest → blocked next 2 days
      for (let off = 1; off <= 2; off++) {
        const futDay = currentDate.getDate() + off;
        if (futDay > daysInMo) {
          restOverlapBonus += REST_OVERLAP_WEIGHT;
        } else {
          const futDate = new Date(ctx.year, ctx.month, futDay);
          if (isDoctorOnLeave(ctx, doc.id, futDate) || isDoctorOnBridgeDay(ctx, doc.id, futDate)) {
            restOverlapBonus += REST_OVERLAP_WEIGHT;
          }
        }
      }
    } else {
      // Day shift → 24h rest → blocked next day for day shift
      const futDay = currentDate.getDate() + 1;
      if (futDay > daysInMo) {
        restOverlapBonus += REST_OVERLAP_WEIGHT;
      } else {
        const futDate = new Date(ctx.year, ctx.month, futDay);
        if (isDoctorOnLeave(ctx, doc.id, futDate) || isDoctorOnBridgeDay(ctx, doc.id, futDate)) {
          restOverlapBonus += REST_OVERLAP_WEIGHT;
        }
      }
    }

    const perturbation = ctx.scorePerturbation.get(doc.id) || 0;

    candidates.push({ doc, paceGap, underTarget: current < target, lookaheadPenalty, continuationBonus, extraShiftPenalty, restOverlapBonus, cadenceOnDutyBonus, cadenceBreakPenalty, perturbation });
  };

  for (const teamId of teamIds) {
    for (const doc of doctorsByTeam.get(teamId) || []) consider(doc);
  }
  for (const doc of floatingDoctors) consider(doc);

  const sortByScore = (a: Candidate, b: Candidate) =>
    (b.paceGap - b.lookaheadPenalty + b.continuationBonus - b.extraShiftPenalty + b.restOverlapBonus + b.cadenceOnDutyBonus - b.cadenceBreakPenalty + b.perturbation) -
    (a.paceGap - a.lookaheadPenalty + a.continuationBonus - a.extraShiftPenalty + a.restOverlapBonus + a.cadenceOnDutyBonus - a.cadenceBreakPenalty + a.perturbation);

  const underTarget = candidates
    .filter(c => c.underTarget)
    .sort(sortByScore);
  const metTarget = candidates
    .filter(c => !c.underTarget)
    .sort(sortByScore);

  const pool = [...underTarget, ...metTarget];
  if (pool.length === 0) return [];

  // Night cap: limit cadence-on-duty doctors for Night shifts to (slotsNeeded - 1).
  // This preserves team members for next-day gap-fill. However, only apply when
  // there are non-cadence candidates that won't cause cadence breaks — forcing a
  // non-cadence doctor into Night when it blocks their own cadence is worse.
  const maxCadenceOnDuty = shiftType === 'night' && slotsNeeded >= 2
    ? slotsNeeded - 1
    : Infinity;
  let cadenceOnDutyCount = 0;

  const selected: DoctorWithTeam[] = [];
  const usedIds = new Set<string>();

  for (let slot = 0; slot < slotsNeeded; slot++) {
    let remaining = pool.filter(c => !usedIds.has(c.doc.id));
    if (remaining.length === 0) break;

    // If we've hit the Night cap, prefer non-cadence-on-duty candidates.
    if (cadenceOnDutyCount >= maxCadenceOnDuty) {
      const nonCadence = remaining.filter(c => c.cadenceOnDutyBonus === 0);
      if (nonCadence.length > 0) remaining = nonCadence;
    }

    if (selected.length === 0) {
      const chosen = remaining[0];
      selected.push(chosen.doc);
      usedIds.add(chosen.doc.id);
      if (chosen.cadenceOnDutyBonus > 0) cadenceOnDutyCount++;
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
      if (chosen.cadenceOnDutyBonus > 0) cadenceOnDutyCount++;
    }
  }

  return selected;
}
