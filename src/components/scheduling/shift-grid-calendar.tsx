'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Doctor, Team, Shift, LeaveDay } from '@/types/scheduling';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, AlertTriangle, X } from 'lucide-react';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import { createClient } from '../../../supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ShiftGridCalendarProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  leaveDays: LeaveDay[];
  currentMonth: number;
  currentYear: number;
  onMonthChange: (month: number, year: number) => void;
  onShiftsUpdate: (shifts: Shift[]) => void;
  onLeaveDaysUpdate: (leaveDays: LeaveDay[]) => void;
}

export default function ShiftGridCalendar({
  doctors,
  teams,
  shifts,
  leaveDays,
  currentMonth,
  currentYear,
  onMonthChange,
  onShiftsUpdate,
  onLeaveDaysUpdate,
}: ShiftGridCalendarProps) {
  const [generating, setGenerating] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const currentLeaveDaysCount = leaveDays.filter(l => {
    const date = new Date(l.leave_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  // Sort doctors: team doctors first (by team order), then floating
  const sortedDoctors = useMemo(() => {
    const teamDoctors = doctors.filter(d => d.team_id && !d.is_floating);
    const floatingDoctors = doctors.filter(d => d.is_floating || !d.team_id);
    
    teamDoctors.sort((a, b) => {
      const teamA = teams.find(t => t.id === a.team_id);
      const teamB = teams.find(t => t.id === b.team_id);
      return (teamA?.order || 0) - (teamB?.order || 0);
    });
    
    return [...teamDoctors, ...floatingDoctors];
  }, [doctors, teams]);

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
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    try {
      // Clear current month from local state immediately so the UI is clean
      onShiftsUpdate(shifts.filter(s => s.shift_date < monthStart || s.shift_date > monthEnd));

      const engine = new SchedulingEngine({
        month: currentMonth,
        year: currentYear,
        doctors,
        teams,
        shiftsPerDay: 3,
        shiftsPerNight: 3,
        leaveDays,
      });

      const result = engine.generateSchedule();
      setWarnings(result.warnings);

      // Delete existing shifts for this month from DB
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd);

      if (deleteError) throw deleteError;

      // Insert new shifts
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

  const getShiftForDoctorAndDay = (doctorId: string, day: number): Shift | undefined => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  };

  const isLeaveDay = (doctorId: string, day: number): boolean => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr);
  };

  // Unified handler for all cell actions. Clicking an already-active option removes it (toggle off).
  // Clicking a different option removes the current state first, then adds the new one.
  const handleCellAction = async (
    doctorId: string,
    day: number,
    action: 'day' | 'night' | 'leave',
    currentShift?: Shift,
    hasLeave?: boolean
  ) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];

      // Remove existing shift if present
      if (currentShift) {
        await supabase.from('shifts').delete().eq('id', currentShift.id);
        updatedShifts = updatedShifts.filter(s => s.id !== currentShift.id);

        if (action === currentShift.shift_type) {
          // Same type clicked → toggle off
          onShiftsUpdate(updatedShifts);
          toast({ title: 'Tură eliminată', description: `Tura din ${day} ${monthNames[currentMonth]} a fost eliminată` });
          return;
        }
      }

      // Remove existing leave day if present
      if (hasLeave) {
        const existingLeave = leaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);
        if (existingLeave) {
          await supabase.from('leave_days').delete().eq('id', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);

          if (action === 'leave') {
            // Concediu clicked again → toggle off
            onLeaveDaysUpdate(updatedLeaveDays);
            toast({ title: 'Concediu eliminat', description: `Ziua de concediu din ${day} ${monthNames[currentMonth]} a fost eliminată` });
            return;
          }

          // Switching from leave to a shift — persist the leave removal immediately
          onLeaveDaysUpdate(updatedLeaveDays);
        }
      }

      // Add new state
      if (action === 'leave') {
        const { data, error } = await supabase
          .from('leave_days')
          .insert({ doctor_id: doctorId, leave_date: dateStr })
          .select()
          .single();
        if (error) throw error;

        onLeaveDaysUpdate([...updatedLeaveDays, data]);
        toast({ title: 'Concediu adăugat', description: `Zi de concediu adăugată pentru ${day} ${monthNames[currentMonth]}` });
      } else {
        const { data, error } = await supabase
          .from('shifts')
          .insert({
            doctor_id: doctorId,
            shift_date: dateStr,
            shift_type: action,
            start_time: action === 'day' ? '08:00' : '20:00',
            end_time: action === 'day' ? '20:00' : '08:00',
          })
          .select()
          .single();
        if (error) throw error;

        onShiftsUpdate([...updatedShifts, data]);
        toast({
          title: 'Tură adăugată',
          description: `Tură de ${action === 'day' ? 'zi' : 'noapte'} adăugată pentru ${day} ${monthNames[currentMonth]}`,
        });
      }
    } catch (error) {
      console.error('Error updating cell:', error);
      toast({ title: 'Eroare', description: 'Nu s-a putut actualiza celula', variant: 'destructive' });
    }
  };

  const getTeamColor = (doctor: Doctor): string => {
    if (doctor.is_floating) return '#6b7280';
    const team = teams.find(t => t.id === doctor.team_id);
    return team?.color || '#6b7280';
  };

  const getDayOfWeek = (day: number): string => {
    const date = new Date(currentYear, currentMonth, day);
    const days = ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'];
    return days[date.getDay()];
  };

  const isWeekend = (day: number): boolean => {
    const date = new Date(currentYear, currentMonth, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Calculate doctor stats for the current month only.
  const getDoctorStats = (doctorId: string) => {
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const doctorShifts = shifts.filter(s => s.doctor_id === doctorId && s.shift_date.startsWith(monthPrefix));
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length;
    const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    const doctorLeaveDays = leaveDays.filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix)).length;
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear);
    const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays - SCHEDULING_CONSTANTS.SHIFT_DURATION * doctorLeaveDays;
    
    return { dayShifts, nightShifts, totalHours, baseNorm };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Program Lunar
              </CardTitle>
              <CardDescription>
                Vizualizează și editează turele pentru fiecare doctor
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Zile concediu luna aceasta: </span>
                <Badge variant="outline">
                  {currentLeaveDaysCount}
                </Badge>
              </div>
              <Button onClick={handleGenerateSchedule} disabled={generating}>
                <Sparkles className="h-4 w-4 mr-2" />
                {generating ? 'Se generează...' : 'Generează Program'}
              </Button>
            </div>
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

          {warnings.length > 0 && (
            <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <ul className="list-disc list-inside">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <ScrollArea className="w-full">
            <div className="min-w-max">
              {/* Header row with days */}
              <div className="flex border-b">
                <div className="w-48 min-w-48 p-2 font-semibold border-r bg-muted sticky left-0 z-10">
                  Doctor
                </div>
                <div className="w-20 min-w-20 p-2 font-semibold border-r bg-muted text-center text-xs">
                  Ore
                </div>
                {days.map(day => (
                  <div
                    key={day}
                    className={`w-10 min-w-10 p-1 text-center border-r text-xs ${
                      isWeekend(day) ? 'bg-muted/50' : ''
                    }`}
                  >
                    <div className="font-semibold">{day}</div>
                    <div className="text-muted-foreground">{getDayOfWeek(day)}</div>
                  </div>
                ))}
              </div>

              {/* Doctor rows */}
              {sortedDoctors.map(doctor => {
                const stats = getDoctorStats(doctor.id);
                const teamColor = getTeamColor(doctor);
                
                return (
                  <div key={doctor.id} className="flex border-b hover:bg-accent/30">
                    <div 
                      className="w-48 min-w-48 p-2 border-r flex items-center gap-2 sticky left-0 bg-background z-10"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: teamColor }}
                      />
                      <span className="truncate text-sm font-medium">{doctor.name}</span>
                      {doctor.is_floating && (
                        <Badge variant="outline" className="text-xs ml-auto">F</Badge>
                      )}
                    </div>
                    <div className="w-20 min-w-20 p-2 border-r text-center text-xs">
                      <div className={stats.totalHours >= stats.baseNorm ? 'text-green-600' : 'text-red-600'}>
                        {stats.totalHours}h
                      </div>
                      <div className="text-muted-foreground">/{stats.baseNorm}h</div>
                    </div>
                    {days.map(day => {
                      const shift = getShiftForDoctorAndDay(doctor.id, day);
                      const isLeave = isLeaveDay(doctor.id, day);

                      return (
                        <div
                          key={day}
                          className={`w-10 min-w-10 border-r flex items-center justify-center ${
                            isWeekend(day) ? 'bg-muted/30' : ''
                          }`}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className={`w-full h-full min-h-[32px] flex items-center justify-center text-xs font-bold transition-colors ${
                                  isLeave
                                    ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800'
                                    : shift?.shift_type === 'day'
                                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                                    : shift?.shift_type === 'night'
                                    ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800'
                                    : 'hover:bg-accent'
                                }`}
                                title="Click pentru a modifica"
                              >
                                {isLeave ? 'C' : shift?.shift_type === 'day' ? 'Z' : shift?.shift_type === 'night' ? 'N' : ''}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                              <DropdownMenuItem onClick={() => handleCellAction(doctor.id, day, 'day', shift, isLeave)}>
                                <span className="w-4 h-4 rounded bg-blue-500 mr-2 flex-shrink-0" />
                                Tură de Zi (Z)
                                {shift?.shift_type === 'day' && <X className="h-3 w-3 ml-auto opacity-50" />}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCellAction(doctor.id, day, 'night', shift, isLeave)}>
                                <span className="w-4 h-4 rounded bg-indigo-500 mr-2 flex-shrink-0" />
                                Tură de Noapte (N)
                                {shift?.shift_type === 'night' && <X className="h-3 w-3 ml-auto opacity-50" />}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCellAction(doctor.id, day, 'leave', shift, isLeave)}>
                                <span className="w-4 h-4 rounded bg-orange-500 mr-2 flex-shrink-0" />
                                Concediu (C)
                                {isLeave && <X className="h-3 w-3 ml-auto opacity-50" />}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Legend */}
          <div className="mt-6 flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-bold">Z</div>
              <span className="text-muted-foreground">Tură de Zi (08:00-20:00)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 rounded flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold">N</div>
              <span className="text-muted-foreground">Tură de Noapte (20:00-08:00)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-100 dark:bg-orange-900 rounded flex items-center justify-center text-orange-700 dark:text-orange-300 text-xs font-bold">C</div>
              <span className="text-muted-foreground">Concediu</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">F</Badge>
              <span className="text-muted-foreground">Doctor Flotant</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
