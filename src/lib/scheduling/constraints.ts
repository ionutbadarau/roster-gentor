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

export function isDoctorOnLeave(ctx: EngineContext, doctorId: string, date: Date): boolean {
  const dateStr = formatDate(date);
  return ctx.leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr);
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
