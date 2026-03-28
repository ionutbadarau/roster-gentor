export interface Doctor {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  team_id?: string;
  is_floating: boolean;
  is_optional?: boolean;
  can_dispatch?: boolean;
  shift_mode?: '12h' | '24h';
  display_order?: number;
  preferences: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveDay {
  id: string;
  doctor_id: string;
  leave_date: string;
  leave_type?: 'regular' | 'bridge';
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
  order: number;
  max_doctors_per_shift?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Shift {
  id: string;
  doctor_id: string;
  shift_date: string;
  shift_type: 'day' | 'night' | '24h' | 'rest';
  start_time?: string;
  end_time?: string;
  is_manual?: boolean;
  is_forced_coverage?: boolean;
  dispatch_type?: 'day' | 'night' | null;
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
  is_forced_coverage?: boolean;
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
