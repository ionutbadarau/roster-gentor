'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import ShiftGridDoctorRow from '@/components/scheduling/shift-grid-doctor-row';
import ShiftGridLegend from '@/components/scheduling/shift-grid-legend';
import { useTranslation } from '@/lib/i18n';
import {
  DEMO_YEAR,
  DEMO_MONTH,
  DEMO_DAYS_IN_MONTH,
  demoTeams,
  demoDoctors,
  demoShifts,
  demoLeaveDays,
  demoNationalHolidays,
  demoDoctorStats,
} from './sample-data';

const noop = () => {};

export default function DemoShiftGrid() {
  const { t, tArray } = useTranslation();

  const days = useMemo(() => Array.from({ length: DEMO_DAYS_IN_MONTH }, (_, i) => i + 1), []);

  const extractCellLetter = (label: string, fallback: string): string => label.match(/\((.+?)\)/)?.[1] || fallback;
  const dayShiftLetter = extractCellLetter(t('scheduling.grid.dayShiftLabel'), 'Z');
  const nightShiftLetter = extractCellLetter(t('scheduling.grid.nightShiftLabel'), 'N');
  const leaveLetter = extractCellLetter(t('scheduling.grid.leaveLabel'), 'C');
  const shift24hLetter = extractCellLetter(t('scheduling.grid.shift24hLabel'), 'DN');

  const dayNames = tArray('daysShort');

  const getDayOfWeek = (day: number): string => {
    const dow = new Date(Date.UTC(DEMO_YEAR, DEMO_MONTH, day)).getUTCDay();
    return dayNames[dow];
  };
  const isWeekend = (day: number): boolean => {
    const dow = new Date(Date.UTC(DEMO_YEAR, DEMO_MONTH, day)).getUTCDay();
    return dow === 0 || dow === 6;
  };

  const holidaySet = useMemo(() => new Set(demoNationalHolidays.map((h) => h.holiday_date)), []);
  const leaveSet = useMemo(
    () => new Set(demoLeaveDays.map((l) => `${l.doctor_id}|${l.leave_date}`)),
    []
  );

  const shiftsByDoctorDay = useMemo(() => {
    const map = new Map<string, typeof demoShifts>();
    for (const s of demoShifts) {
      const key = `${s.doctor_id}|${s.shift_date}`;
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return map;
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = (day: number) => `${DEMO_YEAR}-${pad(DEMO_MONTH + 1)}-${pad(day)}`;

  const isNationalHoliday = (day: number): boolean => holidaySet.has(dateStr(day));
  const isNonWorkingDay = (day: number): boolean => isWeekend(day) || isNationalHoliday(day);

  const teamColorById = useMemo(
    () => Object.fromEntries(demoTeams.map((tm) => [tm.id, tm.color])),
    []
  );

  const sortedDoctors = useMemo(
    () => [...demoDoctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="relative pt-6">
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <div className="flex border-b">
                <div className="w-32 min-w-32 md:w-48 md:min-w-48 p-2 font-semibold border-r bg-muted">
                  {t('scheduling.grid.doctorColumn')}
                </div>
                {days.map((day) => (
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
              {sortedDoctors.map((doctor, idx) => {
                const stats = demoDoctorStats[doctor.id] ?? { dayShifts: 0, nightShifts: 0, totalHours: 0, baseNorm: 0 };
                const teamColor = teamColorById[doctor.team_id ?? ''] ?? '#888';
                const isTeamBoundary = idx > 0 && doctor.team_id !== sortedDoctors[idx - 1].team_id;

                const getShiftsForDay = (day: number) => shiftsByDoctorDay.get(`${doctor.id}|${dateStr(day)}`) ?? [];
                const getShiftForDay = (day: number) => getShiftsForDay(day)[0];
                const isLeaveDay = (day: number) => leaveSet.has(`${doctor.id}|${dateStr(day)}`);

                return (
                  <ShiftGridDoctorRow
                    key={doctor.id}
                    doctor={doctor}
                    isTeamBoundary={isTeamBoundary}
                    teamColor={teamColor}
                    stats={stats}
                    days={days}
                    dayShiftLetter={dayShiftLetter}
                    nightShiftLetter={nightShiftLetter}
                    leaveLetter={leaveLetter}
                    shift24hLetter={shift24hLetter}
                    getShiftForDay={getShiftForDay}
                    getShiftsForDay={getShiftsForDay}
                    isLeaveDay={isLeaveDay}
                    isCellSelected={() => false}
                    hasRestViolation={() => false}
                    isBridgeDay={() => false}
                    isNonWorkingDay={isNonWorkingDay}
                    isUnderstaffedDay={() => false}
                    isNationalHoliday={isNationalHoliday}
                    isWeekend={isWeekend}
                    onCellMouseDown={noop}
                    onCellMouseEnter={noop}
                    hasGenerated={true}
                    altHighlight={false}
                  />
                );
              })}
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
