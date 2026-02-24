export interface Doctor {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  team_id?: string;
  is_floating: boolean;
  preferences: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveDay {
  id: string;
  doctor_id: string;
  leave_date: string;
  created_at?: string;
}

export interface NationalHoliday {
  id: string;
  holiday_date: string;
  description?: string;
  created_at?: string;
}

export interface SchedulingConstants {
  SHIFT_DURATION: 12;
  DAY_SHIFT_REST: 24;
  NIGHT_SHIFT_REST: 48;
  SHIFT_24H_REST: 72;
  MAX_WEEKLY_HOURS: 48;
  BASE_NORM_HOURS_PER_DAY: 7;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  max_members: number;
  order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Shift {
  id: string;
  doctor_id: string;
  shift_date: string;
  shift_type: 'day' | 'night' | 'rest';
  start_time?: string;
  end_time?: string;
  is_manual?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleConfig {
  id: string;
  total_doctors: number;
  config_data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorWithTeam extends Doctor {
  team?: Team;
}

export interface ShiftWithDoctor extends Shift {
  doctor?: DoctorWithTeam;
}

export interface ScheduleConflict {
  type: 'rest_violation' | 'understaffed' | 'overstaffed';
  date: string;
  doctor_id?: string;
  message: string;
}

export interface ScheduleStats {
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  totalHours: number;
  conflicts: ScheduleConflict[];
}

export interface DoctorMonthlyStats {
  doctorId: string;
  totalHours: number;
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  leaveDays: number;
  baseNorm: number;
  meetsBaseNorm: boolean;
}

export interface ScheduleGenerationResult {
  shifts: Shift[];
  conflicts: ScheduleConflict[];
  warnings: string[];
  doctorStats: DoctorMonthlyStats[];
}

export interface ScheduleValidation {
  isValid: boolean;
  requiredLeaveDays: number;
  message: string;
}
