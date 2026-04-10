/**
 * Cadence computation for team-based D-N-R-R scheduling.
 *
 * Each team follows a 4-day cycle: Day, Night, Rest, Rest.
 * Teams are staggered by their `order` field so that on any given day,
 * exactly one team is on Day, one on Night, and two are resting (with 4 teams).
 */

import type { DoctorWithTeam, Shift, Team } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS } from './constants';
import { getShiftStartMs, getShiftEndMs, getRestHours, formatDateString } from './shift-utils';

/**
 * Compute cadence offsets based on how much rest each team has accumulated
 * from the previous month. The most-rested team gets Day on day 1, the
 * next-most-rested gets Night, and the remaining teams rest.
 *
 * Returns null when there are no previous month shifts (falls back to order-based).
 */
export function computeRestBasedOffsets(
  teams: Team[],
  doctors: DoctorWithTeam[],
  previousMonthShifts: Shift[],
  year: number,
  month: number,
): Map<string, number> | null {
  if (previousMonthShifts.length === 0) return null;

  const cycle = SCHEDULING_CONSTANTS.CADENCE_CYCLE_LENGTH;

  // Only consider teams that have at least one 12h cadence doctor
  const cadenceTeamIds = new Set<string>();
  for (const doc of doctors) {
    if (doc.shift_mode !== '24h' && !doc.is_floating && doc.team_id) {
      cadenceTeamIds.add(doc.team_id);
    }
  }
  const cadenceTeams = teams.filter(t => cadenceTeamIds.has(t.id));
  if (cadenceTeams.length === 0) return null;

  // Build set of doctor IDs per team for fast lookup
  const teamDoctorIds = new Map<string, Set<string>>();
  for (const team of cadenceTeams) {
    const ids = new Set<string>();
    for (const doc of doctors) {
      if (doc.team_id === team.id && doc.shift_mode !== '24h' && !doc.is_floating) {
        ids.add(doc.id);
      }
    }
    teamDoctorIds.set(team.id, ids);
  }

  // Start of day 1 of the new month (day shift starts at 08:00)
  const monthStartMs = Date.UTC(year, month, 1, 8);

  // For each cadence team, find the latest shift end time from previous month
  const teamRestPeriods: { teamId: string; restMs: number; order: number }[] = [];

  for (const team of cadenceTeams) {
    const docIds = teamDoctorIds.get(team.id)!;
    let latestEndTime = 0;

    for (const shift of previousMonthShifts) {
      if (!docIds.has(shift.doctor_id)) continue;
      if (shift.shift_type !== 'day' && shift.shift_type !== 'night' && shift.shift_type !== '24h') continue;
      const endTime = getShiftEndMs(shift.shift_date, shift.shift_type as 'day' | 'night' | '24h');
      if (endTime > latestEndTime) latestEndTime = endTime;
    }

    const restMs = latestEndTime > 0 ? monthStartMs - latestEndTime : Infinity;
    teamRestPeriods.push({ teamId: team.id, restMs, order: team.order });
  }

  // Sort descending by rest (most rested first); tie-break by team order
  teamRestPeriods.sort((a, b) => b.restMs - a.restMs || a.order - b.order);

  const offsets = new Map<string, number>();
  teamRestPeriods.forEach((tp, idx) => {
    offsets.set(tp.teamId, idx % cycle);
  });

  return offsets;
}

/**
 * Compute the cadence position for each team on each day.
 *
 * position = (day - 1 + offset) % CADENCE_CYCLE_LENGTH
 *   position 0 = Day shift, 1 = Night shift, 2/3 = Rest
 *
 * Default (V1): offset = (team.order - 1) % cycle
 * Sequential (V2): offset = (cycle - (team.order - 1) % cycle) % cycle
 *   — team with order N starts its Day shift on day N.
 */
export function computeTeamCadenceGrid(
  teams: Team[],
  daysInMonth: number,
  options?: { sequential?: boolean; teamOffsets?: Map<string, number> },
): Map<string, Map<number, 'day' | 'night' | null>> {
  const cycle = SCHEDULING_CONSTANTS.CADENCE_CYCLE_LENGTH;
  const grid = new Map<string, Map<number, 'day' | 'night' | null>>();

  for (const team of teams) {
    // Use pre-computed rest-based offset if available, otherwise fall back to order-based
    let offset: number;
    if (options?.teamOffsets?.has(team.id)) {
      offset = options.teamOffsets.get(team.id)!;
    } else {
      // Safe modulo: JS % can return negative for negative operands
      const rawOffset = ((team.order - 1) % cycle + cycle) % cycle;
      offset = options?.sequential
        ? (cycle - rawOffset) % cycle
        : rawOffset;
    }
    const dayMap = new Map<number, 'day' | 'night' | null>();

    for (let day = 1; day <= daysInMonth; day++) {
      const position = ((day - 1 + offset) % cycle + cycle) % cycle;
      if (position === 0) dayMap.set(day, 'day');
      else if (position === 1) dayMap.set(day, 'night');
      else dayMap.set(day, null);
    }

    grid.set(team.id, dayMap);
  }

  return grid;
}

/**
 * Expand team cadence to individual doctor schedules.
 * Only 12h team doctors get cadence entries; floating and 24h doctors do not.
 */
export function computeDoctorCadenceSchedule(
  doctors: DoctorWithTeam[],
  teamCadence: Map<string, Map<number, 'day' | 'night' | null>>,
): Map<string, Map<number, 'day' | 'night' | null>> {
  const schedule = new Map<string, Map<number, 'day' | 'night' | null>>();

  for (const doc of doctors) {
    if (doc.shift_mode === '24h' || doc.is_floating || !doc.team_id) continue;
    const teamSchedule = teamCadence.get(doc.team_id);
    if (teamSchedule) {
      schedule.set(doc.id, new Map(teamSchedule));
    }
  }

  return schedule;
}

/**
 * Find the next cadence shift (day or night) for a doctor after `afterDay`.
 * Returns null if no cadence shift exists within the month.
 */
export function getNextCadenceShift(
  doctorCadence: Map<number, 'day' | 'night' | null>,
  afterDay: number,
  daysInMonth: number,
): { day: number; shiftType: 'day' | 'night' } | null {
  for (let d = afterDay + 1; d <= daysInMonth; d++) {
    const st = doctorCadence.get(d);
    if (st === 'day' || st === 'night') return { day: d, shiftType: st };
  }
  return null;
}

/**
 * Check if assigning a shift on `day` of type `shiftType` would block
 * this doctor from working their next cadence shift (forward protection).
 *
 * Uses actual shift timing (start/end/rest) from shift-utils.
 */
/**
 * Check if assigning a shift on `day` of type `shiftType` would block
 * this doctor from working their next cadence shift (forward protection).
 *
 * Uses actual shift timing (start/end/rest) from shift-utils.
 */
export function wouldBlockNextCadence(
  year: number,
  month: number,
  day: number,
  shiftType: 'day' | 'night' | '24h',
  doctorCadence: Map<number, 'day' | 'night' | null>,
  daysInMonth: number,
): boolean {
  const next = getNextCadenceShift(doctorCadence, day, daysInMonth);
  if (!next) return false;

  const dateStr = formatDateString(year, month, day);
  const shiftEndMs = getShiftEndMs(dateStr, shiftType);
  const restNeeded = getRestHours(shiftType);
  const restEndMs = shiftEndMs + restNeeded * 3_600_000;

  const nextDateStr = formatDateString(year, month, next.day);
  const nextStartMs = getShiftStartMs(nextDateStr, next.shiftType);

  return nextStartMs < restEndMs;
}
