/**
 * Pure date/time utility functions used throughout the scheduling engine.
 * All functions are stateless — they take parameters and return values.
 */

export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getMonthPrefix(year: number, month: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}`;
}

/** UTC milliseconds for a given date+hour, avoiding DST issues. */
export function utcMs(year: number, month: number, day: number, hour: number): number {
  return Date.UTC(year, month, day, hour, 0, 0, 0);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getWorkingDaysInMonth(year: number, month: number, holidayDateSet: Set<string>): number {
  const daysInMonth = getDaysInMonth(year, month);
  let workingDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDateSet.has(formatDate(date))) {
      workingDays++;
    }
  }
  return workingDays;
}

export function isHoliday(date: Date, holidayDateSet: Set<string>): boolean {
  return holidayDateSet.has(formatDate(date));
}

export function isNonWorkingDay(date: Date, holidayDateSet: Set<string>): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(date, holidayDateSet);
}

/** Returns the week number within the month (0-indexed). */
export function getWeekNumber(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOffset = firstDay.getDay();
  return Math.floor((date.getDate() + dayOffset - 1) / 7);
}
