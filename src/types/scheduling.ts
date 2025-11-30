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

export interface Team {
  id: string;
  name: string;
  color: string;
  max_members: number;
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
