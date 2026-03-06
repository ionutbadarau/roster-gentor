/**
 * Shared date formatting and shift grouping utilities.
 */

import type { Shift } from '@/types/scheduling';

/** Pad a number to 2 digits. */
const pad = (n: number) => String(n).padStart(2, '0');

/** Build a YYYY-MM-DD string from year, 0-indexed month, and day. */
export function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Return the month prefix (YYYY-MM) for filtering. */
export function getMonthPrefix(year: number, month: number): string {
  return `${year}-${pad(month + 1)}`;
}

/** Return the first and last date strings for a given month. */
export function getMonthBoundary(year: number, month: number, daysInMonth: number): { start: string; end: string } {
  return {
    start: formatDateString(year, month, 1),
    end: formatDateString(year, month, daysInMonth),
  };
}

/** Group shifts into a Map keyed by shift_date. */
export function groupShiftsByDate(shifts: Shift[]): Map<string, Shift[]> {
  const map = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!map.has(s.shift_date)) map.set(s.shift_date, []);
    map.get(s.shift_date)!.push(s);
  }
  return map;
}

/** Group shifts into a Map keyed by doctor_id. */
export function groupShiftsByDoctor(shifts: Shift[]): Map<string, Shift[]> {
  const map = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!map.has(s.doctor_id)) map.set(s.doctor_id, []);
    map.get(s.doctor_id)!.push(s);
  }
  return map;
}
