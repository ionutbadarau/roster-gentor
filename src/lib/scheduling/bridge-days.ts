/**
 * Bridge day computation.
 *
 * A "bridge day" is a non-working day (weekend or holiday) that sits between
 * two leave periods for a doctor. Bridge days block scheduling for that doctor
 * but do NOT reduce their base norm (only explicit leave days do).
 *
 * Example: Doctor has leave on Fri 9th and Mon 12th → Sat 10th and Sun 11th
 * are bridge days and should not have shifts assigned.
 */

import type { LeaveDay, NationalHoliday } from '@/types/scheduling';
import { formatDate, getDaysInMonth } from './calendar-utils';

/**
 * Compute bridge days for a single doctor.
 * Returns a Set of "YYYY-MM-DD" strings that are bridge days.
 */
export function computeDoctorBridgeDays(
  doctorId: string,
  leaveDays: LeaveDay[],
  month: number,
  year: number,
  nationalHolidays: NationalHoliday[] = []
): Set<string> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthPrefix = `${year}-${pad(month + 1)}`;
  const daysInMonth = getDaysInMonth(year, month);
  const holidaySet = new Set(nationalHolidays.map(h => h.holiday_date));

  const leaveDates = new Set(
    leaveDays
      .filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix))
      .map(l => l.leave_date)
  );

  const fmt = (d: Date) => formatDate(d);

  const isNonWorking = (d: Date) => {
    const dow = d.getDay();
    return dow === 0 || dow === 6 || holidaySet.has(fmt(d));
  };

  const bridgeDays = new Set<string>();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = fmt(date);

    if (!isNonWorking(date) || leaveDates.has(dateStr)) continue;

    let hasLeaveBefore = false;
    let hasLeaveAfter = false;

    for (let d = day - 1; d >= 1; d--) {
      const checkDate = new Date(year, month, d);
      const checkStr = fmt(checkDate);
      if (leaveDates.has(checkStr)) { hasLeaveBefore = true; break; }
      if (!isNonWorking(checkDate) && !leaveDates.has(checkStr)) break;
    }

    for (let d = day + 1; d <= daysInMonth; d++) {
      const checkDate = new Date(year, month, d);
      const checkStr = fmt(checkDate);
      if (leaveDates.has(checkStr)) { hasLeaveAfter = true; break; }
      if (!isNonWorking(checkDate) && !leaveDates.has(checkStr)) break;
    }

    if (hasLeaveBefore && hasLeaveAfter) {
      bridgeDays.add(dateStr);
    }
  }

  return bridgeDays;
}

/**
 * Compute bridge days for all doctors. Returns a Map of doctorId → Set<dateStr>.
 * This is the DRY version — calls computeDoctorBridgeDays for each doctor.
 */
export function computeAllBridgeDays(
  doctors: { id: string }[],
  leaveDays: LeaveDay[],
  month: number,
  year: number,
  nationalHolidays: NationalHoliday[] = []
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const doc of doctors) {
    result.set(doc.id, computeDoctorBridgeDays(doc.id, leaveDays, month, year, nationalHolidays));
  }
  return result;
}
