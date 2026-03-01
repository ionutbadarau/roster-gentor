'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ShiftGridCalendar from '@/components/scheduling/shift-grid-calendar';
import { useDoctors, useTeams, useShifts, useLeaveDays, useNationalHolidays, useScheduleConfig, useUserId, queryKeys } from '@/lib/queries';
import type { Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';

export default function GridPage() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const { data: doctors = [], isLoading: loadingDoctors } = useDoctors();
  const { data: teams = [], isLoading: loadingTeams } = useTeams();
  const { data: shifts = [], isLoading: loadingShifts } = useShifts();
  const { data: leaveDays = [], isLoading: loadingLeave } = useLeaveDays();
  const { data: nationalHolidays = [], isLoading: loadingHolidays } = useNationalHolidays();
  const { data: config, isLoading: loadingConfig } = useScheduleConfig();
  const { data: userId = null } = useUserId();

  const loading = loadingDoctors || loadingTeams || loadingShifts || loadingLeave || loadingHolidays || loadingConfig;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ShiftGridCalendar
        doctors={doctors}
        teams={teams}
        shifts={shifts}
        leaveDays={leaveDays}
        nationalHolidays={nationalHolidays}
        shiftsPerDay={config?.shiftsPerDay ?? 3}
        shiftsPerNight={config?.shiftsPerNight ?? 3}
        currentMonth={currentMonth}
        currentYear={currentYear}
        userId={userId}
        onMonthChange={(month, year) => {
          setCurrentMonth(month);
          setCurrentYear(year);
        }}
        onShiftsUpdate={(newShifts: Shift[]) => {
          queryClient.setQueryData(queryKeys.shifts, newShifts);
        }}
        onLeaveDaysUpdate={(newLeaveDays: LeaveDay[]) => {
          queryClient.setQueryData(queryKeys.leaveDays, newLeaveDays);
        }}
        onNationalHolidaysUpdate={(newHolidays: NationalHoliday[]) => {
          queryClient.setQueryData(queryKeys.nationalHolidays, newHolidays);
        }}
      />
    </div>
  );
}
