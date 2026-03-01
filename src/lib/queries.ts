import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../supabase/client';
import type { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';

const supabase = createClient();

export const queryKeys = {
  doctors: ['doctors'] as const,
  teams: ['teams'] as const,
  shifts: ['shifts'] as const,
  leaveDays: ['leave_days'] as const,
  nationalHolidays: ['national_holidays'] as const,
  scheduleConfig: ['schedule_config'] as const,
  userId: ['user_id'] as const,
};

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors,
    queryFn: async () => {
      const { data, error } = await supabase.from('doctors').select('*');
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*');
      if (error) throw error;
      return (data ?? []) as Team[];
    },
  });
}

export function useShifts() {
  return useQuery({
    queryKey: queryKeys.shifts,
    queryFn: async () => {
      const { data, error } = await supabase.from('shifts').select('*');
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

export function useLeaveDays() {
  return useQuery({
    queryKey: queryKeys.leaveDays,
    queryFn: async () => {
      const { data, error } = await supabase.from('leave_days').select('*');
      if (error) throw error;
      return (data ?? []) as LeaveDay[];
    },
  });
}

export function useNationalHolidays() {
  return useQuery({
    queryKey: queryKeys.nationalHolidays,
    queryFn: async () => {
      const { data, error } = await supabase.from('national_holidays').select('*');
      if (error) throw error;
      return (data ?? []) as NationalHoliday[];
    },
  });
}

export function useScheduleConfig() {
  return useQuery({
    queryKey: queryKeys.scheduleConfig,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const cfg = data?.config_data as Record<string, number> | undefined;
      return {
        shiftsPerDay: cfg?.shiftsPerDay ?? 1,
        shiftsPerNight: cfg?.shiftsPerNight ?? 1,
      };
    },
  });
}

export function useUserId() {
  return useQuery({
    queryKey: queryKeys.userId,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: Infinity,
  });
}
