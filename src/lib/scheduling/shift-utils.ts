/**
 * Shared date formatting and shift grouping utilities.
 */

import type { Shift } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS } from './constants';

// ── Shift timing helpers ──────────────────────────────────────────────────
// Compute actual start/end timestamps and rest hours for any shift type,
// so constraint checks use real times instead of midnight approximations.

/** Parse a YYYY-MM-DD string into [year, month0, day]. */
export function parseDateStr(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number);
  return [parts[0], parts[1] - 1, parts[2]];
}

/** Actual start timestamp (ms) for a shift. Day and 24h start at 08:00; night at 20:00. */
export function getShiftStartMs(dateStr: string, shiftType: 'day' | 'night' | '24h'): number {
  const [y, m, d] = parseDateStr(dateStr);
  return shiftType === 'night'
    ? Date.UTC(y, m, d, 20)
    : Date.UTC(y, m, d, 8);
}

/** Actual end timestamp (ms) for a shift. Day ends 20:00 same day; night/24h end 08:00 next day. */
export function getShiftEndMs(dateStr: string, shiftType: 'day' | 'night' | '24h'): number {
  const [y, m, d] = parseDateStr(dateStr);
  return shiftType === 'day'
    ? Date.UTC(y, m, d, 20)
    : Date.UTC(y, m, d + 1, 8);
}

/** Required rest hours after a given shift type. */
export function getRestHours(shiftType: 'day' | 'night' | '24h'): number {
  if (shiftType === '24h') return SCHEDULING_CONSTANTS.SHIFT_24H_REST;
  if (shiftType === 'night') return SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;
  return SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
}

/**
 * Check if two shifts have a rest violation using actual start/end times.
 * Returns true if there IS a conflict.
 */
export function hasActualTimeRestConflict(
  dateA: string, typeA: 'day' | 'night' | '24h',
  dateB: string, typeB: 'day' | 'night' | '24h',
): boolean {
  const endA = getShiftEndMs(dateA, typeA);
  const startB = getShiftStartMs(dateB, typeB);
  const endB = getShiftEndMs(dateB, typeB);
  const startA = getShiftStartMs(dateA, typeA);

  // Check overlap
  if (startA < endB && startB < endA) return true;

  // A finishes before B starts → check A's rest
  if (endA <= startB) {
    const gapHours = (startB - endA) / 3_600_000;
    if (gapHours < getRestHours(typeA)) return true;
  }
  // B finishes before A starts → check B's rest
  if (endB <= startA) {
    const gapHours = (startA - endB) / 3_600_000;
    if (gapHours < getRestHours(typeB)) return true;
  }
  return false;
}

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
