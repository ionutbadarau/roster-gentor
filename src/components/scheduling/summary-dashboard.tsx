'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Doctor, Team, Shift, ScheduleConflict } from '@/types/scheduling';
import { Users, Calendar, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import QuickStartGuide from './quick-start-guide';
import { useTranslation } from '@/lib/i18n';

interface SummaryDashboardProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  currentMonth: number;
  currentYear: number;
}

export default function SummaryDashboard({
  doctors,
  teams,
  shifts,
  currentMonth,
  currentYear,
}: SummaryDashboardProps) {
  const { t, tArray, tMessage } = useTranslation();
  const monthNames = tArray('months');

  const conflicts = SchedulingEngine.detectConflicts(shifts, doctors);
  const dayShifts = shifts.filter((s) => s.shift_type === 'day').length;
  const nightShifts = shifts.filter((s) => s.shift_type === 'night').length;
  const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const requiredDayShifts = daysInMonth * 3; // 3 doctors per day shift
  const requiredNightShifts = daysInMonth * 3; // 3 doctors per night shift
  const dayCoverage = requiredDayShifts > 0 ? (dayShifts / requiredDayShifts) * 100 : 0;
  const nightCoverage = requiredNightShifts > 0 ? (nightShifts / requiredNightShifts) * 100 : 0;

  const floatingDoctors = doctors.filter((d) => d.is_floating).length;
  const teamDoctors = doctors.filter((d) => !d.is_floating).length;

  const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear);
  const baseNormPerDoctor = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays;

  const teamStats = teams.map((team) => {
    const teamDoctorsList = doctors.filter((d) => d.team_id === team.id);
    const teamShifts = shifts.filter((s) =>
      teamDoctorsList.some((d) => d.id === s.doctor_id)
    );
    return {
      team,
      doctorCount: teamDoctorsList.length,
      shiftCount: teamShifts.length,
    };
  });

  return (
    <div className="space-y-6">
      <QuickStartGuide
        hasTeams={teams.length > 0}
        hasDoctors={doctors.length > 0}
        hasSchedule={shifts.length > 0}
      />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('scheduling.summary.totalDoctors')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{doctors.length}</div>
            <p className="text-xs text-muted-foreground">
              {t('scheduling.summary.inTeamsFloating', { teams: teamDoctors, floating: floatingDoctors })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('scheduling.summary.totalShifts')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shifts.length}</div>
            <p className="text-xs text-muted-foreground">
              {t('scheduling.summary.dayNight', { day: dayShifts, night: nightShifts })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('scheduling.summary.totalHours')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}h</div>
            <p className="text-xs text-muted-foreground">
              {t('scheduling.summary.forMonthYear', { month: monthNames[currentMonth], year: currentYear })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('scheduling.summary.conflicts')}</CardTitle>
            {conflicts.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${conflicts.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
              {conflicts.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {conflicts.length === 0 ? t('scheduling.summary.allGood') : t('scheduling.summary.issuesDetected')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('scheduling.summary.coverageStats')}</CardTitle>
            <CardDescription>
              {t('scheduling.summary.coverageFor', { month: monthNames[currentMonth], year: currentYear })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('scheduling.summary.dayCoverage')}</span>
                <span className="font-medium">{Math.round(dayCoverage)}%</span>
              </div>
              <Progress value={Math.min(dayCoverage, 100)} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {t('scheduling.summary.ofRequired', { actual: dayShifts, required: requiredDayShifts })}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('scheduling.summary.nightCoverage')}</span>
                <span className="font-medium">{Math.round(nightCoverage)}%</span>
              </div>
              <Progress value={Math.min(nightCoverage, 100)} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {t('scheduling.summary.ofRequired', { actual: nightShifts, required: requiredNightShifts })}
              </p>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('scheduling.summary.totalCoverage')}</span>
                <span className="text-lg font-bold">
                  {Math.round(((dayShifts + nightShifts) / (requiredDayShifts + requiredNightShifts)) * 100) || 0}%
                </span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('scheduling.summary.baseNorm')}</span>
                <span className="font-medium">{baseNormPerDoctor}h</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('scheduling.summary.workingDaysCalc', { days: workingDays, hours: SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('scheduling.summary.teamsOverview')}</CardTitle>
            <CardDescription>
              {t('scheduling.summary.teamsConfigured', { count: teams.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamStats.map(({ team, doctorCount, shiftCount }) => (
                <div key={team.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('scheduling.summary.doctorCount', { count: doctorCount, suffix: doctorCount !== 1 ? 's' : '' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{shiftCount}</p>
                    <p className="text-xs text-muted-foreground">{t('scheduling.summary.shifts')}</p>
                  </div>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('scheduling.summary.noTeams')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              {t('scheduling.summary.conflictsTitle')}
            </CardTitle>
            <CardDescription>
              {t('scheduling.summary.conflictsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {conflicts.map((conflict, index) => (
                <Alert key={index} className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <AlertDescription className="text-sm">
                    <span className="font-medium">{conflict.date}:</span> {tMessage(conflict.message)}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {doctors.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('scheduling.summary.noDoctorAlert')}
          </AlertDescription>
        </Alert>
      )}

      {doctors.length > 0 && shifts.length === 0 && (
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertDescription>
            {t('scheduling.summary.noScheduleAlert')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
