/**
 * Shift recording, counter management, and per-doctor statistics.
 */

import type { DoctorWithTeam, Shift, DoctorMonthlyStats } from '@/types/scheduling';
import type { EngineContext } from './constants';
import { SCHEDULING_CONSTANTS } from './constants';
import { utcMs, getWeekNumber, getWorkingDaysInMonth, getMonthPrefix } from './calendar-utils';

export function calculateBaseNorm(ctx: EngineContext, doctorId: string): number {
  const workingDays = getWorkingDaysInMonth(ctx.year, ctx.month, ctx.holidayDateSet);
  const monthPrefix = getMonthPrefix(ctx.year, ctx.month);
  const doctorLeaveDays = ctx.leaveDays.filter(
    l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix) && l.leave_type !== 'bridge'
  ).length;
  return SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - doctorLeaveDays);
}

export function recordShift(ctx: EngineContext, doctor: DoctorWithTeam, date: Date, shiftType: 'day' | 'night'): void {
  const shiftEndTime = shiftType === 'day'
    ? utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20)
    : utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);

  ctx.doctorLastShift.set(doctor.id, {
    date,
    type: shiftType,
    endTime: shiftEndTime
  });

  ctx.doctorShiftCount.set(doctor.id, (ctx.doctorShiftCount.get(doctor.id) || 0) + 1);
  ctx.doctorHours.set(doctor.id, (ctx.doctorHours.get(doctor.id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);

  const weekNumber = getWeekNumber(date);
  if (!ctx.doctorWeeklyHours.has(doctor.id)) {
    ctx.doctorWeeklyHours.set(doctor.id, new Map());
  }
  const weeklyMap = ctx.doctorWeeklyHours.get(doctor.id)!;
  weeklyMap.set(weekNumber, (weeklyMap.get(weekNumber) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
}

/** Record a 24h shift (08:00→08:00+1). Counts as 2 slot-fills, 24h of work. */
export function recordShift24h(ctx: EngineContext, doctor: DoctorWithTeam, date: Date): void {
  const shiftEndTime = utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);

  ctx.doctorLastShift.set(doctor.id, {
    date,
    type: '24h',
    endTime: shiftEndTime,
  });

  // Counts as 2 slots (1 day + 1 night)
  ctx.doctorShiftCount.set(doctor.id, (ctx.doctorShiftCount.get(doctor.id) || 0) + 2);
  ctx.doctorHours.set(doctor.id, (ctx.doctorHours.get(doctor.id) || 0) + 24);

  const weekNumber = getWeekNumber(date);
  if (!ctx.doctorWeeklyHours.has(doctor.id)) {
    ctx.doctorWeeklyHours.set(doctor.id, new Map());
  }
  const weeklyMap = ctx.doctorWeeklyHours.get(doctor.id)!;
  weeklyMap.set(weekNumber, (weeklyMap.get(weekNumber) || 0) + 24);
}

/**
 * Rebuild doctorShiftCount and doctorHours from the final shifts array
 * (the greedy-pass counters become stale after the repair phase).
 */
export function rebuildCounters(ctx: EngineContext, shifts: Shift[]): void {
  ctx.doctors.forEach(d => {
    ctx.doctorShiftCount.set(d.id, 0);
    ctx.doctorHours.set(d.id, 0);
  });

  const allShifts = [...ctx.fixedShifts, ...shifts];
  for (const s of allShifts) {
    if (s.shift_type === '24h') {
      ctx.doctorShiftCount.set(s.doctor_id, (ctx.doctorShiftCount.get(s.doctor_id) || 0) + 2);
      ctx.doctorHours.set(s.doctor_id, (ctx.doctorHours.get(s.doctor_id) || 0) + 24);
    } else if (s.shift_type === 'day' || s.shift_type === 'night') {
      ctx.doctorShiftCount.set(s.doctor_id, (ctx.doctorShiftCount.get(s.doctor_id) || 0) + 1);
      ctx.doctorHours.set(s.doctor_id, (ctx.doctorHours.get(s.doctor_id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
    }
  }
}

export function checkDoctorNorms(ctx: EngineContext): string[] {
  const warnings: string[] = [];

  for (const doc of ctx.doctors) {
    if (doc.is_optional) continue;
    const baseNorm = calculateBaseNorm(ctx, doc.id);
    const currentHours = ctx.doctorHours.get(doc.id) || 0;

    if (currentHours < baseNorm) {
      const shortfall = baseNorm - currentHours;
      const requiredLeaveDays = Math.ceil(shortfall / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY);
      warnings.push(
        `scheduling.engine.normWarning::${JSON.stringify({ name: doc.name, days: requiredLeaveDays })}`
      );
    }
  }

  return warnings;
}

export function applyShiftRounding(ctx: EngineContext, shifts: Shift[]): void {
  for (const doctor of ctx.doctors) {
    const baseNorm = calculateBaseNorm(ctx, doctor.id);
    const currentHours = ctx.doctorHours.get(doctor.id) || 0;

    if (currentHours > baseNorm && currentHours < baseNorm + SCHEDULING_CONSTANTS.SHIFT_DURATION) {
      ctx.doctorShiftCount.set(doctor.id, (ctx.doctorShiftCount.get(doctor.id) || 0) + 1);
    }
  }
}

export function calculateDoctorStats(ctx: EngineContext, shifts: Shift[]): DoctorMonthlyStats[] {
  const monthPrefix = getMonthPrefix(ctx.year, ctx.month);
  const allShifts = [...ctx.fixedShifts, ...shifts];

  return ctx.doctors.map(doctor => {
    const baseNorm = doctor.is_optional ? 0 : calculateBaseNorm(ctx, doctor.id);
    const totalHours = ctx.doctorHours.get(doctor.id) || 0;
    const leaveDays = ctx.leaveDays.filter(
      l => l.doctor_id === doctor.id && l.leave_date.startsWith(monthPrefix) && l.leave_type !== 'bridge'
    ).length;

    const doctorShifts = allShifts.filter(s => s.doctor_id === doctor.id);
    const shifts24h = doctorShifts.filter(s => s.shift_type === '24h').length;
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length + shifts24h;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length + shifts24h;

    return {
      doctorId: doctor.id,
      totalHours,
      totalShifts: ctx.doctorShiftCount.get(doctor.id) || 0,
      dayShifts,
      nightShifts,
      leaveDays,
      baseNorm,
      meetsBaseNorm: doctor.is_optional ? true : totalHours >= baseNorm,
    };
  });
}
