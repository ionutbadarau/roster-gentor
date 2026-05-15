/**
 * Constraint checking for doctor shift assignments.
 *
 * Each function takes an EngineContext (the scheduling engine's state)
 * and determines whether a doctor can work a given shift.
 */

import type { DoctorWithTeam, Shift } from '@/types/scheduling';
import type { EngineContext } from './constants';
import { SCHEDULING_CONSTANTS } from './constants';
import { formatDate, utcMs, getWeekNumber } from './calendar-utils';
import { parseDateStr, formatDateString } from './shift-utils';

export function isDoctorOnLeave(ctx: EngineContext, doctorId: string, date: Date): boolean {
  const dateStr = formatDate(date);
  return ctx.leaveDays.some(
    l =>
      l.doctor_id === doctorId &&
      l.leave_date === dateStr &&
      l.leave_type !== 'no_bridge'
  );
}

export function isDoctorOnBridgeDay(ctx: EngineContext, doctorId: string, date: Date): boolean {
  const dateStr = formatDate(date);
  return ctx.doctorBridgeDays.get(doctorId)?.has(dateStr) ?? false;
}

/**
 * Check if a doctor can work a shift on a given date.
 * Checks: leave, bridge day, rest period (backward), weekly hours, forward fixed-shift collision.
 * `duration` overrides the default 12h for weekly-hours check (use 24 for 24h shifts).
 */
export function canDoctorWork(
  ctx: EngineContext,
  doctor: DoctorWithTeam,
  date: Date,
  shiftType: 'day' | 'night',
  duration: number = SCHEDULING_CONSTANTS.SHIFT_DURATION
): boolean {
  if (isDoctorOnLeave(ctx, doctor.id, date)) return false;
  if (isDoctorOnBridgeDay(ctx, doctor.id, date)) return false;

  const lastShift = ctx.doctorLastShift.get(doctor.id);
  if (!lastShift) {
    // Still need weekly hours check even without a previous shift
    const weekNumber = getWeekNumber(date);
    const weeklyHours = ctx.doctorWeeklyHours.get(doctor.id)?.get(weekNumber) || 0;
    if (weeklyHours + duration > SCHEDULING_CONSTANTS.MAX_WEEKLY_HOURS) return false;
    return true;
  }

  const shiftStartMs = shiftType === 'day'
    ? utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 8)
    : utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20);

  const hoursSinceLastShift = (shiftStartMs - lastShift.endTime) / (1000 * 60 * 60);

  if (lastShift.type === 'day' && hoursSinceLastShift < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) return false;
  if (lastShift.type === 'night' && hoursSinceLastShift < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) return false;
  if (lastShift.type === '24h' && hoursSinceLastShift < SCHEDULING_CONSTANTS.SHIFT_24H_REST) return false;

  const weekNumber = getWeekNumber(date);
  const weeklyHours = ctx.doctorWeeklyHours.get(doctor.id)?.get(weekNumber) || 0;
  if (weeklyHours + duration > SCHEDULING_CONSTANTS.MAX_WEEKLY_HOURS) return false;

  // Forward check: ensure this shift's mandatory rest period doesn't collide
  // with an upcoming fixed (manual) shift for this doctor.
  const fixedForDoctor = ctx.fixedShiftsByDoctor.get(doctor.id);
  if (fixedForDoctor) {
    // For 24h shifts, end is 08:00 next day; rest needed is 72h
    const shiftEndMs = duration === 24
      ? utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8)
      : shiftType === 'day'
        ? utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20)
        : utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);
    const restNeeded = duration === 24
      ? SCHEDULING_CONSTANTS.SHIFT_24H_REST
      : shiftType === 'day'
        ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
        : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;

    for (const fixed of fixedForDoctor) {
      if (fixed.startMs <= shiftEndMs) continue;
      const gapHours = (fixed.startMs - shiftEndMs) / (1000 * 60 * 60);
      if (gapHours < restNeeded) return false;
    }
  }

  return true;
}

/**
 * Check rest constraints for a doctor against an explicit list of shifts
 * (instead of the mutable doctorLastShift map). Used by the repair solver.
 *
 * Note: existingShifts includes ALL shifts (not just this doctor's) — the
 * function checks all of them for overlap and rest violations.
 */
export function canDoctorWorkWithTimeline(
  ctx: EngineContext,
  doctorId: string,
  date: Date,
  shiftType: 'day' | 'night',
  existingShifts: Shift[]
): boolean {
  if (isDoctorOnLeave(ctx, doctorId, date)) return false;
  if (isDoctorOnBridgeDay(ctx, doctorId, date)) return false;

  const shiftStartMs = shiftType === 'day'
    ? utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 8)
    : utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20);
  const shiftEndMs = shiftType === 'day'
    ? utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20)
    : utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);

  for (const s of existingShifts) {
    if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
    const parts = s.shift_date.split('-').map(Number);

    const sStartMs = s.shift_type === 'night'
      ? utcMs(parts[0], parts[1] - 1, parts[2], 20)
      : utcMs(parts[0], parts[1] - 1, parts[2], 8); // day and 24h both start at 08:00
    const sEndMs = s.shift_type === 'day'
      ? utcMs(parts[0], parts[1] - 1, parts[2], 20)
      : utcMs(parts[0], parts[1] - 1, parts[2] + 1, 8); // night and 24h both end at 08:00+1

    // Overlap
    if (sStartMs < shiftEndMs && shiftStartMs < sEndMs) return false;

    // Rest after existing shift → proposed shift
    if (sEndMs <= shiftStartMs) {
      const restNeeded = s.shift_type === '24h'
        ? SCHEDULING_CONSTANTS.SHIFT_24H_REST
        : s.shift_type === 'day'
          ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
          : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;
      const gapHours = (shiftStartMs - sEndMs) / (1000 * 60 * 60);
      if (gapHours < restNeeded) return false;
    }

    // Rest after proposed shift → existing shift
    if (shiftEndMs <= sStartMs) {
      const restNeeded = shiftType === 'day'
        ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
        : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;
      const gapHours = (sStartMs - shiftEndMs) / (1000 * 60 * 60);
      if (gapHours < restNeeded) return false;
    }
  }

  return true;
}

/**
 * Check if placing a shift on `dateStr` for this doctor would create 4+
 * consecutive working days. Only examines the doctor's own shifts.
 */
export function wouldExceedConsecutiveDays(
  doctorId: string,
  dateStr: string,
  allShifts: Shift[],
): boolean {
  const [y, m, d] = parseDateStr(dateStr);
  // Build set of days (as day-of-month offsets relative to dateStr) that the doctor works
  // We only need to look at a window of [date-3 .. date+3] (7-day range)
  const workingDays = new Set<number>();
  workingDays.add(0); // The proposed day

  for (const s of allShifts) {
    if (s.doctor_id !== doctorId) continue;
    if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
    const [sy, sm, sd] = parseDateStr(s.shift_date);
    // Compute day difference using UTC dates to avoid DST issues
    const diffMs = Date.UTC(sy, sm, sd) - Date.UTC(y, m, d);
    const diffDays = Math.round(diffMs / 86_400_000);
    if (diffDays >= -3 && diffDays <= 3) {
      workingDays.add(diffDays);
    }
  }

  // Check every window of 4 consecutive days that includes day 0
  for (let start = -3; start <= 0; start++) {
    let count = 0;
    for (let i = start; i < start + 4; i++) {
      if (workingDays.has(i)) count++;
    }
    if (count >= 4) return true;
  }

  return false;
}

/**
 * Check if placing a shift of `shiftType` on `dateStr` for this doctor would
 * create an NZN pattern (Night → Day → Night with no gap = 36h continuous work).
 *
 * NZN on calendar:
 *   Night(day D):   20:00(D) → 08:00(D+1)
 *   Day(day D+1):   08:00(D+1) → 20:00(D+1)
 *   Night(day D+1): 20:00(D+1) → 08:00(D+2)
 * This means continuous work from 20:00(D) to 08:00(D+2) = 36h.
 *
 * The proposed shift can be any of the three positions in the pattern.
 */
export function wouldCreateNZNPattern(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
): boolean {
  const [y, m, d] = parseDateStr(dateStr);

  // Helper: check if the doctor has a specific shift type on a given day offset
  const hasShiftOrAll = (dayOffset: number, type: 'day' | 'night'): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === type || s.shift_type === '24h')
    );
  };

  if (shiftType === 'night') {
    // Proposed shift is Night on day D.
    // Pattern 1: This is the FIRST Night → need Day(D+1) and Night(D+1)
    if (hasShiftOrAll(1, 'day') && hasShiftOrAll(1, 'night')) return true;

    // Pattern 2: This is the LAST Night → need Night(D-1) and Day(D)
    // NZN = Night(D-1), Day(D), Night(D) — the proposed night completes it
    if (hasShiftOrAll(-1, 'night') && hasShiftOrAll(0, 'day')) return true;
  }

  if (shiftType === 'day') {
    // Proposed shift is Day on day D.
    // NZN = Night(D-1), Day(D), Night(D)
    if (hasShiftOrAll(-1, 'night') && hasShiftOrAll(0, 'night')) return true;
  }

  return false;
}

/**
 * Check if placing a shift of `shiftType` on `dateStr` for this doctor would
 * create a ZNZ pattern (Day → Night → Day across 3 consecutive calendar days):
 *
 *   Day(D-2):   08:00(D-2) → 20:00(D-2)
 *   Night(D-1): 20:00(D-1) → 08:00(D)
 *   Day(D):     08:00(D)   → 20:00(D)
 *
 * The Night(D-1) and Day(D) shifts run back-to-back with 0h rest = 24h continuous
 * work, and the doctor totals 36h of work over a 60h window. Indistinguishable
 * from a single 36h shift in terms of fatigue.
 *
 * The proposed shift can be any of the three positions (D-2 Day, D-1 Night, or D Day).
 * 24h shifts count as both day and night.
 */
export function wouldCreateZNZPattern(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
): boolean {
  const [y, m, d] = parseDateStr(dateStr);

  const hasShiftOrAll = (dayOffset: number, type: 'day' | 'night'): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === type || s.shift_type === '24h')
    );
  };

  if (shiftType === 'day') {
    // Proposed Day on D.
    // Pattern A: Day(D-2), Night(D-1), Day(D) — proposed completes the trail
    if (hasShiftOrAll(-2, 'day') && hasShiftOrAll(-1, 'night')) return true;
    // Pattern B: Day(D), Night(D+1), Day(D+2) — proposed starts the trail
    if (hasShiftOrAll(1, 'night') && hasShiftOrAll(2, 'day')) return true;
  }

  if (shiftType === 'night') {
    // Proposed Night on D — sits as the middle of ZNZ on D-1, D, D+1
    if (hasShiftOrAll(-1, 'day') && hasShiftOrAll(1, 'day')) return true;
  }

  return false;
}

/**
 * Check if placing a shift of `shiftType` on `dateStr` for this doctor would
 * create an NZN pattern *spread* across 3 calendar days:
 *
 *   Night(D-2): 20:00(D-2) → 08:00(D-1)
 *   Day(D-1):   08:00(D-1) → 20:00(D-1)
 *   Night(D):   20:00(D)   → 08:00(D+1)
 *
 * The Night(D-2) → Day(D-1) leg runs back-to-back with 0h rest = 24h continuous.
 * Total 36h work in a 60h window. Distinct from `wouldCreateNZNPattern` which
 * fires on the *tight* NZN over 2 calendar days (N(D), Z(D+1), N(D+1)).
 *
 * The proposed shift can be any of the three positions.
 */
export function wouldCreateNZNSpreadPattern(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
): boolean {
  const [y, m, d] = parseDateStr(dateStr);

  const hasShiftOrAll = (dayOffset: number, type: 'day' | 'night'): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === type || s.shift_type === '24h')
    );
  };

  if (shiftType === 'night') {
    // Position A (left N): this N + Day(D+1) + Night(D+2)
    if (hasShiftOrAll(1, 'day') && hasShiftOrAll(2, 'night')) return true;
    // Position C (right N): Night(D-2) + Day(D-1) + this N
    if (hasShiftOrAll(-2, 'night') && hasShiftOrAll(-1, 'day')) return true;
  }

  if (shiftType === 'day') {
    // Position B (middle Z): Night(D-1) + this Z + Night(D+1)
    if (hasShiftOrAll(-1, 'night') && hasShiftOrAll(1, 'night')) return true;
  }

  return false;
}

/**
 * Check if placing a Night shift on D would create 3 consecutive nights for
 * this doctor. 24h shifts count as nights.
 *
 * Only fires when proposed `shiftType === 'night'` — a pure Day candidate can
 * never *complete* a night triplet. (24h candidates enter via the engine's dual
 * call pattern at scheduling-engine.ts:859–860 and are caught on the night leg.)
 */
export function wouldCreateThreeConsecutiveNights(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
): boolean {
  if (shiftType !== 'night') return false;
  const [y, m, d] = parseDateStr(dateStr);

  const hasNightOrAll = (dayOffset: number): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === 'night' || s.shift_type === '24h')
    );
  };

  // Position L: this N + N(D+1) + N(D+2)
  if (hasNightOrAll(1) && hasNightOrAll(2)) return true;
  // Position M: N(D-1) + this N + N(D+1)
  if (hasNightOrAll(-1) && hasNightOrAll(1)) return true;
  // Position R: N(D-2) + N(D-1) + this N
  if (hasNightOrAll(-2) && hasNightOrAll(-1)) return true;

  return false;
}

/**
 * Check if placing a shift on D would violate the "2 days off after 2
 * consecutive nights" rule. For any pair N(A), N(A+1) by the same doctor,
 * no shift of any type may exist on A+2 or A+3. Earliest next shift = A+4.
 *
 * Six sub-cases — the proposed shift can be:
 *   - The rest-day at A+2 (any type) — D-2, D-1 are nights
 *   - The rest-day at A+3 (any type) — D-3, D-2 are nights
 *   - The earlier night of the pair, with a shift already on A+2 or A+3
 *   - The later   night of the pair, with a shift already on A+1 or A+2
 */
export function wouldViolateRestAfterTwoNights(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
): boolean {
  const [y, m, d] = parseDateStr(dateStr);

  const hasNightOrAll = (dayOffset: number): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === 'night' || s.shift_type === '24h')
    );
  };

  const hasAnyShift = (dayOffset: number): boolean => {
    const checkDate = new Date(Date.UTC(y, m, d + dayOffset));
    const checkStr = formatDateString(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
    return allShifts.some(
      s => s.doctor_id === doctorId && s.shift_date === checkStr &&
           (s.shift_type === 'day' || s.shift_type === 'night' || s.shift_type === '24h')
    );
  };

  // Sub-1: proposed shift is the rest-day A+2 (any type fires)
  if (hasNightOrAll(-2) && hasNightOrAll(-1)) return true;
  // Sub-2: proposed shift is the rest-day A+3 (any type fires)
  if (hasNightOrAll(-3) && hasNightOrAll(-2)) return true;

  if (shiftType === 'night') {
    // Sub-3: proposed N(D) is earlier night of pair, existing shift on D+2
    if (hasNightOrAll(1) && hasAnyShift(2)) return true;
    // Sub-4: proposed N(D) is earlier night of pair, existing shift on D+3
    if (hasNightOrAll(1) && hasAnyShift(3)) return true;
    // Sub-5: proposed N(D) is later night of pair, existing shift on D+1
    if (hasNightOrAll(-1) && hasAnyShift(1)) return true;
    // Sub-6: proposed N(D) is later night of pair, existing shift on D+2
    if (hasNightOrAll(-1) && hasAnyShift(2)) return true;
  }

  return false;
}

/**
 * Check if placing a shift on D would put a Night (12h doctor) or 24h shift
 * (24h-mode doctor) immediately before a regular-leave day on D+1.
 *
 * Only `leave_type === 'regular'` triggers this rule. Bridge / no_bridge days
 * don't count as "vacation". Day shifts on D remain allowed for 12h doctors.
 *
 * `regularLeaveByDoctor` is precomputed in the engine: doctorId → set of
 * "YYYY-MM-DD" dates where the doctor has a regular leave entry.
 */
export function wouldCreateNightBeforeRegularLeave(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  is24hMode: boolean,
  regularLeaveByDoctor: Map<string, Set<string>>,
): boolean {
  const leaves = regularLeaveByDoctor.get(doctorId);
  if (!leaves || leaves.size === 0) return false;

  const [y, m, d] = parseDateStr(dateStr);
  const next = new Date(Date.UTC(y, m, d + 1));
  const nextStr = formatDateString(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
  if (!leaves.has(nextStr)) return false;

  // 24h-mode doctor: any 24h shift on D blocks (engine probes via shiftType='day' and 'night')
  if (is24hMode) return true;

  // 12h doctor: only Night shift on D is forbidden
  return shiftType === 'night';
}

/**
 * Returns true if placing a shift would violate any hard constraint.
 * Hard constraints are NEVER allowed to be violated, even in force-fill.
 *
 * Includes:
 *   - 4+ consecutive working days (`wouldExceedConsecutiveDays`)
 *   - NZN tight: Night(D) → Day(D+1) → Night(D+1) = 36h continuous
 *     (`wouldCreateNZNPattern`)
 *   - NZN spread: Night(D), Day(D+1), Night(D+2) over 3 calendar days = 24h
 *     continuous tail, 36h work in 60h (`wouldCreateNZNSpreadPattern`)
 *   - ZNZ: Day(D), Night(D+1), Day(D+2) over 3 calendar days = 24h continuous
 *     tail, 36h work in 60h (`wouldCreateZNZPattern`)
 *   - 3 consecutive nights (`wouldCreateThreeConsecutiveNights`)
 *   - 2 days off required after 2 consecutive nights
 *     (`wouldViolateRestAfterTwoNights`)
 *   - No Night (12h) or 24h shift on the day before regular leave
 *     (`wouldCreateNightBeforeRegularLeave`) — only when `regularLeaveByDoctor`
 *     is supplied by the caller
 */
export function violatesHardConstraints(
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night',
  allShifts: Shift[],
  regularLeaveByDoctor?: Map<string, Set<string>>,
  is24hMode?: boolean,
): boolean {
  if (wouldExceedConsecutiveDays(doctorId, dateStr, allShifts)) return true;
  if (wouldCreateNZNPattern(doctorId, dateStr, shiftType, allShifts)) return true;
  if (wouldCreateNZNSpreadPattern(doctorId, dateStr, shiftType, allShifts)) return true;
  if (wouldCreateZNZPattern(doctorId, dateStr, shiftType, allShifts)) return true;
  if (wouldCreateThreeConsecutiveNights(doctorId, dateStr, shiftType, allShifts)) return true;
  if (wouldViolateRestAfterTwoNights(doctorId, dateStr, shiftType, allShifts)) return true;
  if (regularLeaveByDoctor && wouldCreateNightBeforeRegularLeave(
    doctorId, dateStr, shiftType, !!is24hMode, regularLeaveByDoctor
  )) return true;
  return false;
}
