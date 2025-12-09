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
  const [warnings, setWarnings] = useState<string[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
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
        title: 'Eroare',
        description: 'Adaugă doctori înainte de a genera programul',
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
        teams,
        shiftsPerDay: 3,
        shiftsPerNight: 3,
        leaveDays: [],
      });

      const result = engine.generateSchedule();
      setConflicts(result.conflicts);
      setWarnings(result.warnings);

      await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)
        .lte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${daysInMonth}`);

      const { error } = await supabase.from('shifts').insert(
        result.shifts.map(({ id, ...shift }) => shift)
      );

      if (error) throw error;

      toast({
        title: 'Succes',
        description: `Program generat pentru ${monthNames[currentMonth]} ${currentYear}`,
      });

      onShiftsUpdate(result.shifts);
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({
        title: 'Eroare',
        description: 'Nu s-a putut genera programul',
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
                Program Lunar
              </CardTitle>
              <CardDescription>
                Vizualizează și gestionează turele pentru lună
              </CardDescription>
            </div>
            <Button onClick={handleGenerateSchedule} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {generating ? 'Se generează...' : 'Generează Program'}
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
                {conflicts.length} conflict(e) detectate în program
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-7 gap-2">
            {['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'].map((day) => (
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
                        Z: {dayShiftCount}
                      </div>
                    )}
                    {nightShiftCount > 0 && (
                      <div className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                        N: {nightShiftCount}
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
              <span className="text-muted-foreground">Tură de Zi (8:00-20:00)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-indigo-100 dark:bg-indigo-900 rounded"></div>
              <span className="text-muted-foreground">Tură de Noapte (20:00-8:00)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
