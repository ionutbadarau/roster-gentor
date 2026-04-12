import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../supabase/client';
import type { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';
import { getMonthBoundary } from '@/lib/scheduling/shift-utils';

const supabase = createClient();

export const queryKeys = {
  doctors: ['doctors'] as const,
  teams: ['teams'] as const,
  shifts: (year: number, month: number) => ['shifts', year, month] as const,
  leaveDays: (year: number, month: number) => ['leave_days', year, month] as const,
  nationalHolidays: (year: number, month: number) => ['national_holidays', year, month] as const,
  scheduleConfig: ['schedule_config'] as const,
  userId: ['user_id'] as const,
};

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors,
    queryFn: async () => {
      const { data, error } = await supabase.from('doctors').select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Team[];
    },
  });
}

export function useShifts(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.shifts(year, month),
    queryFn: async () => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const { start, end } = getMonthBoundary(year, month, daysInMonth);
      const { data, error } = await supabase.from('shifts').select('*').gte('shift_date', start).lte('shift_date', end);
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

export function useLeaveDays(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.leaveDays(year, month),
    queryFn: async () => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const { start, end } = getMonthBoundary(year, month, daysInMonth);
      const { data, error } = await supabase.from('leave_days').select('*').gte('leave_date', start).lte('leave_date', end);
      if (error) throw error;
      return (data ?? []) as LeaveDay[];
    },
  });
}

export function useNationalHolidays(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.nationalHolidays(year, month),
    queryFn: async () => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const { start, end } = getMonthBoundary(year, month, daysInMonth);
      const { data, error } = await supabase.from('national_holidays').select('*').gte('holiday_date', start).lte('holiday_date', end);
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
