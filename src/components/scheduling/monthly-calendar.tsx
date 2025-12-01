'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Doctor, Team, Shift, ScheduleConflict } from '@/types/scheduling';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, AlertTriangle } from 'lucide-react';
import { SchedulingEngine } from '@/lib/scheduling-engine';
import { createClient } from '../../../supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MonthlyCalendarProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  currentMonth: number;
  currentYear: number;
  onMonthChange: (month: number, year: number) => void;
  onShiftsUpdate: (shifts: Shift[]) => void;
}

export default function MonthlyCalendar({
  doctors,
  teams,
  shifts,
  currentMonth,
  currentYear,
  onMonthChange,
  onShiftsUpdate,
}: MonthlyCalendarProps) {
  const [generating, setGenerating] = useState(false);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const handlePreviousMonth = () => {
    if (currentMonth === 0) {
      onMonthChange(11, currentYear - 1);
    } else {
      onMonthChange(currentMonth - 1, currentYear);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      onMonthChange(0, currentYear + 1);
    } else {
      onMonthChange(currentMonth + 1, currentYear);
    }
  };

  const handleGenerateSchedule = async () => {
    if (doctors.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add doctors before generating schedule',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    try {
      const engine = new SchedulingEngine({
        month: currentMonth,
        year: currentYear,
        doctors,
        shiftsPerDay: 3,
        shiftsPerNight: 3,
      });

      const newShifts = engine.generateSchedule();
      const detectedConflicts = SchedulingEngine.detectConflicts(newShifts, doctors);
      setConflicts(detectedConflicts);

      await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)
        .lte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${daysInMonth}`);

      const { error } = await supabase.from('shifts').insert(
        newShifts.map(({ id, ...shift }) => shift)
      );

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Schedule generated for ${monthNames[currentMonth]} ${currentYear}`,
      });

      onShiftsUpdate(newShifts);
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate schedule',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const getShiftsForDate = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.filter((shift) => shift.shift_date === dateStr);
  };

  const getDoctorById = (doctorId: string) => {
    return doctors.find((d) => d.id === doctorId);
  };

  const getTeamById = (teamId?: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Monthly Schedule
              </CardTitle>
              <CardDescription>
                View and manage shift assignments for the month
              </CardDescription>
            </div>
            <Button onClick={handleGenerateSchedule} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {generating ? 'Generating...' : 'Generate Schedule'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-xl font-semibold">
              {monthNames[currentMonth]} {currentYear}
            </h3>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {conflicts.length > 0 && (
            <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                {conflicts.length} conflict(s) detected in the schedule
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center font-semibold text-sm py-2 text-muted-foreground">
                {day}
              </div>
            ))}

            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dayShifts = getShiftsForDate(day);
              const dayShiftCount = dayShifts.filter((s) => s.shift_type === 'day').length;
              const nightShiftCount = dayShifts.filter((s) => s.shift_type === 'night').length;

              return (
                <div
                  key={day}
                  className="aspect-square border rounded-lg p-2 bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="text-sm font-medium mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayShiftCount > 0 && (
                      <div className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                        Day: {dayShiftCount}
                      </div>
                    )}
                    {nightShiftCount > 0 && (
                      <div className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                        Night: {nightShiftCount}
                      </div>
                    )}
                    {dayShifts.slice(0, 6).map((shift) => {
                      const doctor = getDoctorById(shift.doctor_id);
                      const team = doctor ? getTeamById(doctor.team_id) : null;
                      return (
                        <div
                          key={shift.id}
                          className="text-xs truncate px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: team ? `${team.color}20` : '#e5e7eb',
                            color: team ? team.color : '#6b7280',
                          }}
                        >
                          {doctor?.name.split(' ')[0]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900 rounded"></div>
              <span className="text-muted-foreground">Day Shift (8:00-20:00)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-indigo-100 dark:bg-indigo-900 rounded"></div>
              <span className="text-muted-foreground">Night Shift (20:00-8:00)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
