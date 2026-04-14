'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { formatDateString, getMonthPrefix, groupShiftsByDoctor, getShiftStartMs, getShiftEndMs, getRestHours } from '@/lib/scheduling/shift-utils';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import ShiftGridDoctorRow from './shift-grid-doctor-row';
import ShiftGridLegend from './shift-grid-legend';
import type { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';

interface ReadOnlyScheduleViewProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  leaveDays: LeaveDay[];
  nationalHolidays: NationalHoliday[];
  month: number;
  year: number;
  viewingDoctorId: string;
}

export default function ReadOnlyScheduleView({
  doctors,
  teams,
  shifts,
  leaveDays,
  nationalHolidays,
  month,
  year,
  viewingDoctorId,
}: ReadOnlyScheduleViewProps) {
  const { t, tArray } = useTranslation();
  const monthNames = tArray('months');
  const dayNames = tArray('daysShort');

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthPrefix = getMonthPrefix(year, month);

  const sortedDoctors = useMemo(() => {
    const teamOrderMap = new Map(teams.map((t) => [t.id, t.order ?? 0]));
    return [...doctors].sort((a, b) => {
      const teamA = a.team_id ? (teamOrderMap.get(a.team_id) ?? 999) : 999;
      const teamB = b.team_id ? (teamOrderMap.get(b.team_id) ?? 999) : 999;
      if (teamA !== teamB) return teamA - teamB;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
  }, [doctors, teams]);

  const hasGeneratedForMonth = useMemo(() => {
    return shifts.some(s => s.shift_date.startsWith(monthPrefix));
  }, [shifts, monthPrefix]);

  // Helpers
  const getShiftForDoctorAndDay = (doctorId: string, day: number): Shift | undefined => {
    const dateStr = formatDateString(year, month, day);
    return shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  };

  const getShiftsForDoctorAndDay = (doctorId: string, day: number): Shift[] => {
    const dateStr = formatDateString(year, month, day);
    return shifts.filter(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  };

  const isLeaveDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(year, month, day);
    return leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type !== 'bridge');
  };

  const isManualBridgeDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(year, month, day);
    return leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type === 'bridge');
  };

  const getTeamColor = (doctor: Doctor): string => {
    if (doctor.is_floating) return '#6b7280';
    const team = teams.find(t => t.id === doctor.team_id);
    return team?.color || '#6b7280';
  };

  const getDayOfWeek = (day: number): string => {
    const date = new Date(year, month, day);
    return dayNames[date.getDay()];
  };

  const isWeekend = (day: number): boolean => {
    const date = new Date(year, month, day);
    const d = date.getDay();
    return d === 0 || d === 6;
  };

  const isNationalHoliday = (day: number): boolean => {
    const dateStr = formatDateString(year, month, day);
    return nationalHolidays.some(h => h.holiday_date === dateStr);
  };

  const isNonWorkingDay = (day: number): boolean => isWeekend(day) || isNationalHoliday(day);

  const isBridgeDay = (doctorId: string, day: number): boolean => {
    if (isManualBridgeDay(doctorId, day)) return true;
    const dateStr = formatDateString(year, month, day);
    const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctorId, leaveDays, month, year, nationalHolidays);
    return bridgeDays.has(dateStr);
  };

  const getDoctorStats = (doctorId: string) => {
    const doctorShifts = shifts.filter(s => s.doctor_id === doctorId && s.shift_date.startsWith(monthPrefix));
    const shifts24h = doctorShifts.filter(s => s.shift_type === '24h').length;
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length + shifts24h;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length + shifts24h;
    const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    const doctorLeaveDays = leaveDays.filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix) && l.leave_type !== 'bridge').length;
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(month, year, nationalHolidays);
    const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - doctorLeaveDays);
    return { dayShifts, nightShifts, totalHours, baseNorm };
  };

  const restViolations = useMemo(() => {
    const violations = new Set<string>();
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    const byDoctor = groupShiftsByDoctor(monthShifts);

    byDoctor.forEach((doctorShifts, doctorId) => {
      const workShifts = doctorShifts.filter(s => s.shift_type === 'day' || s.shift_type === 'night' || s.shift_type === '24h');
      const sorted = workShifts.sort((a, b) =>
        getShiftStartMs(a.shift_date, a.shift_type as 'day' | 'night' | '24h') -
        getShiftStartMs(b.shift_date, b.shift_type as 'day' | 'night' | '24h')
      );

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevType = prev.shift_type as 'day' | 'night' | '24h';
        const currType = curr.shift_type as 'day' | 'night' | '24h';
        const gapHours = (getShiftStartMs(curr.shift_date, currType) - getShiftEndMs(prev.shift_date, prevType)) / 3_600_000;
        const minRest = getRestHours(prevType);

        if (gapHours < minRest) {
          violations.add(`${doctorId}:${prev.shift_date}`);
          violations.add(`${doctorId}:${curr.shift_date}`);
        }
      }
    });

    return violations;
  }, [shifts, monthPrefix]);

  const hasRestViolation = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(year, month, day);
    return restViolations.has(`${doctorId}:${dateStr}`);
  };

  const extractCellLetter = (label: string, fallback: string): string => {
    return label.match(/\((.+?)\)/)?.[1] || fallback;
  };

  const dayShiftLetter = extractCellLetter(t('scheduling.grid.dayShiftLabel'), 'Z');
  const nightShiftLetter = extractCellLetter(t('scheduling.grid.nightShiftLabel'), 'N');
  const leaveLetter = extractCellLetter(t('scheduling.grid.leaveLabel'), 'C');
  const shift24hLetter = extractCellLetter(t('scheduling.grid.shift24hLabel'), 'DN');

  const viewingDoctor = doctors.find(d => d.id === viewingDoctorId);
  const noop = () => {};

  return (
    <div className="max-w-[1400px] mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {t('scheduleView.title', { month: monthNames[month], year: String(year) })}
              </CardTitle>
              <CardDescription>
                {t('scheduleView.subtitle')}
                {viewingDoctor && (
                  <span className="ml-2">
                    — <strong>{viewingDoctor.name}</strong>
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="text-lg font-semibold">
              {monthNames[month]} {year}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Header row */}
          <div className="sticky top-0 z-20 bg-background overflow-hidden">
            <div className="min-w-max">
              <div className="flex border-b">
                <div className="w-32 min-w-32 md:w-48 md:min-w-48 p-2 font-semibold border-r bg-muted">
                  {t('scheduling.grid.doctorColumn')}
                </div>
                {days.map(day => (
                  <div
                    key={day}
                    className={`w-10 min-w-10 p-1 text-center border-r text-xs select-none ${
                      isNationalHoliday(day)
                        ? 'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : isWeekend(day)
                        ? 'bg-muted text-muted-foreground'
                        : ''
                    }`}
                  >
                    <div className="font-semibold">{day}</div>
                    <div>{getDayOfWeek(day)}</div>
                  </div>
                ))}
                <div className="w-20 min-w-20 p-2 font-semibold border-r bg-muted text-center text-xs">
                  {t('scheduling.grid.hoursColumn')}
                </div>
              </div>
            </div>
          </div>

          {/* Doctor rows */}
          <ScrollArea className="w-full">
            <div className="min-w-max">
              {sortedDoctors.map((doctor, idx) => (
                <ShiftGridDoctorRow
                  key={doctor.id}
                  doctor={doctor}
                  isTeamBoundary={idx > 0 && doctor.team_id !== sortedDoctors[idx - 1].team_id}
                  teamColor={getTeamColor(doctor)}
                  stats={getDoctorStats(doctor.id)}
                  days={days}
                  dayShiftLetter={dayShiftLetter}
                  nightShiftLetter={nightShiftLetter}
                  leaveLetter={leaveLetter}
                  shift24hLetter={shift24hLetter}
                  getShiftForDay={(day) => getShiftForDoctorAndDay(doctor.id, day)}
                  getShiftsForDay={(day) => getShiftsForDoctorAndDay(doctor.id, day)}
                  isLeaveDay={(day) => isLeaveDay(doctor.id, day)}
                  isCellSelected={() => false}
                  hasRestViolation={(day) => hasRestViolation(doctor.id, day)}
                  isBridgeDay={(day) => isBridgeDay(doctor.id, day)}
                  isNonWorkingDay={isNonWorkingDay}
                  isUnderstaffedDay={() => false}
                  isNationalHoliday={isNationalHoliday}
                  isWeekend={isWeekend}
                  onCellMouseDown={noop}
                  onCellMouseEnter={noop}
                  hasGenerated={hasGeneratedForMonth}
                  altHighlight={doctor.id === viewingDoctorId}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <ShiftGridLegend
            dayShiftLetter={dayShiftLetter}
            nightShiftLetter={nightShiftLetter}
            leaveLetter={leaveLetter}
            shift24hLetter={shift24hLetter}
          />
        </CardContent>
      </Card>
    </div>
  );
}
