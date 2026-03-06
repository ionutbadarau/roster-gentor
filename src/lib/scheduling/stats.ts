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
    l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix)
  ).length;
  return SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays - SCHEDULING_CONSTANTS.SHIFT_DURATION * doctorLeaveDays;
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
    if (s.shift_type !== 'day' && s.shift_type !== 'night') continue;
    ctx.doctorShiftCount.set(s.doctor_id, (ctx.doctorShiftCount.get(s.doctor_id) || 0) + 1);
    ctx.doctorHours.set(s.doctor_id, (ctx.doctorHours.get(s.doctor_id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
  }
}

export function checkDoctorNorms(ctx: EngineContext): string[] {
  const warnings: string[] = [];

  for (const doc of ctx.doctors) {
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
    const baseNorm = calculateBaseNorm(ctx, doctor.id);
    const totalHours = ctx.doctorHours.get(doctor.id) || 0;
    const leaveDays = ctx.leaveDays.filter(
      l => l.doctor_id === doctor.id && l.leave_date.startsWith(monthPrefix)
    ).length;

    const doctorShifts = allShifts.filter(s => s.doctor_id === doctor.id);
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length;

    return {
      doctorId: doctor.id,
      totalHours,
      totalShifts: ctx.doctorShiftCount.get(doctor.id) || 0,
      dayShifts,
      nightShifts,
      leaveDays,
      baseNorm,
      meetsBaseNorm: totalHours >= baseNorm,
    };
  });
}
