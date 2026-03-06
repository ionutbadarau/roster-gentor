import type { DoctorWithTeam, Team, LeaveDay, NationalHoliday, Shift } from '@/types/scheduling';

export const SCHEDULING_CONSTANTS = {
  SHIFT_DURATION: 12,
  DAY_SHIFT_REST: 24,
  NIGHT_SHIFT_REST: 48,
  SHIFT_24H_REST: 72,
  MAX_WEEKLY_HOURS: 48,
  BASE_NORM_HOURS_PER_DAY: 7,
};

export interface ScheduleGenerationOptions {
  month: number;
  year: number;
  doctors: DoctorWithTeam[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  leaveDays?: LeaveDay[];
  nationalHolidays?: NationalHoliday[];
  fixedShifts?: Shift[];
  previousMonthShifts?: Shift[];
}

/**
 * Shared state passed to all scheduling helper functions.
 * The SchedulingEngine class satisfies this interface.
 */
export interface EngineContext {
  doctors: DoctorWithTeam[];
  teams: Team[];
  month: number;
  year: number;
  shiftsPerDay: number;
  shiftsPerNight: number;
  leaveDays: LeaveDay[];
  nationalHolidays: NationalHoliday[];
  fixedShifts: Shift[];
  previousMonthShifts: Shift[];
  holidayDateSet: Set<string>;
  doctorBridgeDays: Map<string, Set<string>>;
  doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' | '24h'; endTime: number }>;
  fixedShiftsByDoctor: Map<string, { startMs: number; shiftType: 'day' | 'night' }[]>;
  doctorShiftCount: Map<string, number>;
  doctorHours: Map<string, number>;
  doctorWeeklyHours: Map<string, Map<number, number>>;
}
