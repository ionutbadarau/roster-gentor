/**
 * Static validation and analysis utilities.
 *
 * These functions are used both pre-generation (UI support for capacity checks,
 * leave validation, understaffing preview) and post-generation (conflict detection).
 */

import type { Doctor, Shift, ScheduleConflict, LeaveDay, NationalHoliday, ScheduleValidation } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS } from './constants';
import { computeDoctorBridgeDays } from './bridge-days';
import { getWorkingDaysInMonth } from './calendar-utils';
import { groupShiftsByDate, groupShiftsByDoctor } from './shift-utils';

/**
 * Convenience wrapper: accepts NationalHoliday[] (builds the Set internally).
 * Delegates to the canonical getWorkingDaysInMonth from calendar-utils.
 */
export function getWorkingDaysInMonthStatic(month: number, year: number, nationalHolidays: NationalHoliday[] = []): number {
  const holidaySet = new Set(nationalHolidays.map(h => h.holiday_date));
  return getWorkingDaysInMonth(year, month, holidaySet);
}

export function calculatePossibleLeaveDays(
  month: number,
  year: number,
  totalDoctors: number,
  shiftsPerDay: number,
  shiftsPerNight: number,
  nationalHolidays: NationalHoliday[] = []
): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalShiftsNeeded = daysInMonth * (shiftsPerDay + shiftsPerNight);
  const workingDays = getWorkingDaysInMonthStatic(month, year, nationalHolidays);

  const baseNormPerDoctor = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays;
  const totalCapacityHours = totalDoctors * baseNormPerDoctor;
  const totalShiftHours = totalShiftsNeeded * SCHEDULING_CONSTANTS.SHIFT_DURATION;

  const excessHours = totalCapacityHours - totalShiftHours;

  return Math.max(0, Math.floor(excessHours / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY));
}

export function validateLeaveDays(
  leaveDays: LeaveDay[],
  doctors: Doctor[],
  month: number,
  year: number,
  shiftsPerDay: number,
  shiftsPerNight: number,
  nationalHolidays: NationalHoliday[] = []
): ScheduleValidation {
  const possibleLeaveDays = calculatePossibleLeaveDays(
    month, year, doctors.length, shiftsPerDay, shiftsPerNight, nationalHolidays
  );

  const totalLeaveDays = leaveDays.length;

  if (totalLeaveDays > possibleLeaveDays) {
    return {
      isValid: false,
      requiredLeaveDays: possibleLeaveDays,
      message: `scheduling.engine.tooManyLeaveDays::${JSON.stringify({ max: possibleLeaveDays })}`,
    };
  }

  return {
    isValid: true,
    requiredLeaveDays: 0,
    message: '',
  };
}

/**
 * Pre-generation analysis: for each day, check if enough doctors are available
 * (not on leave, not on bridge day) to fill the required shift slots.
 */
export function computeUnderstaffedDays(
  month: number,
  year: number,
  doctors: Doctor[],
  leaveDays: LeaveDay[],
  shiftsPerDay: number,
  shiftsPerNight: number,
  nationalHolidays: NationalHoliday[] = []
): Map<number, { available: number; required: number }> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const required = shiftsPerDay + shiftsPerNight;
  const result = new Map<number, { available: number; required: number }>();
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthPrefix = `${year}-${pad(month + 1)}`;

  const bridgeDaysByDoctor = new Map<string, Set<string>>();
  for (const doc of doctors) {
    bridgeDaysByDoctor.set(
      doc.id,
      computeDoctorBridgeDays(doc.id, leaveDays, month, year, nationalHolidays)
    );
  }

  const leaveDatesByDoctor = new Map<string, Set<string>>();
  for (const l of leaveDays) {
    if (!l.leave_date.startsWith(monthPrefix)) continue;
    if (!leaveDatesByDoctor.has(l.doctor_id)) leaveDatesByDoctor.set(l.doctor_id, new Set());
    leaveDatesByDoctor.get(l.doctor_id)!.add(l.leave_date);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    let available = 0;

    for (const doc of doctors) {
      const isOnLeave = leaveDatesByDoctor.get(doc.id)?.has(dateStr) ?? false;
      const isOnBridge = bridgeDaysByDoctor.get(doc.id)?.has(dateStr) ?? false;
      if (!isOnLeave && !isOnBridge) available++;
    }

    if (available < required) {
      result.set(day, { available, required });
    }
  }

  return result;
}

/**
 * Post-generation validation: detects understaffing and rest violations.
 */
export function detectConflicts(shifts: Shift[], doctors: Doctor[], requiredPerDay = 2, requiredPerNight = 2): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const shiftsByDate = groupShiftsByDate(shifts);

  shiftsByDate.forEach((dayShifts, date) => {
    const dayShiftCount = dayShifts.filter(s => s.shift_type === 'day').length;
    const nightShiftCount = dayShifts.filter(s => s.shift_type === 'night').length;

    if (dayShiftCount < requiredPerDay) {
      conflicts.push({
        type: 'understaffed',
        date,
        message: `scheduling.engine.understaffedDay::${JSON.stringify({ count: dayShiftCount, required: requiredPerDay, date })}`,
      });
    }

    if (nightShiftCount < requiredPerNight) {
      conflicts.push({
        type: 'understaffed',
        date,
        message: `scheduling.engine.understaffedNight::${JSON.stringify({ count: nightShiftCount, required: requiredPerNight, date })}`,
      });
    }
  });

  const doctorShifts = groupShiftsByDoctor(shifts);

  doctorShifts.forEach((doctorShiftList, doctorId) => {
    const sortedShifts = doctorShiftList.sort((a, b) =>
      new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
    );

    for (let i = 1; i < sortedShifts.length; i++) {
      const prevShift = sortedShifts[i - 1];
      const currShift = sortedShifts[i];

      const prevDate = new Date(prevShift.shift_date);
      const currDate = new Date(currShift.shift_date);
      const hoursBetween = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);

      if (prevShift.shift_type === 'day' && hoursBetween < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) {
        conflicts.push({
          type: 'rest_violation',
          date: currShift.shift_date,
          doctor_id: doctorId,
          message: `scheduling.engine.restViolationDay::${JSON.stringify({ hours: SCHEDULING_CONSTANTS.DAY_SHIFT_REST })}`,
        });
      }

      if (prevShift.shift_type === 'night' && hoursBetween < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) {
        conflicts.push({
          type: 'rest_violation',
          date: currShift.shift_date,
          doctor_id: doctorId,
          message: `scheduling.engine.restViolationNight::${JSON.stringify({ hours: SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST })}`,
        });
      }
    }
  });

  return conflicts;
}
