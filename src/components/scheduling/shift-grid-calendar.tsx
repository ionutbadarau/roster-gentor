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

  // Calculate possible leave days
  const possibleLeaveDays = useMemo(() => {
    return SchedulingEngine.calculatePossibleLeaveDays(
      currentMonth,
      currentYear,
      doctors.length,
      3, // shiftsPerDay
      3  // shiftsPerNight
    );
  }, [currentMonth, currentYear, doctors.length]);

  const currentLeaveDaysCount = leaveDays.filter(l => {
    const date = new Date(l.leave_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  const remainingLeaveDays = possibleLeaveDays - currentLeaveDaysCount;

  // Sort doctors: team doctors first (by team order), then floating
  const sortedDoctors = useMemo(() => {
    const teamDoctors = doctors.filter(d => !d.is_floating && d.team_id);
    const floatingDoctors = doctors.filter(d => d.is_floating);
    
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
    try {
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

      // Delete existing shifts for this month
      await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)
        .lte('shift_date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${daysInMonth}`);

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

  const handleCellClick = async (doctorId: string, day: number, currentShift?: Shift) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (currentShift) {
      // Remove the shift
      try {
        await supabase.from('shifts').delete().eq('id', currentShift.id);
        onShiftsUpdate(shifts.filter(s => s.id !== currentShift.id));
        toast({
          title: 'Tura eliminată',
          description: `Tura din ${day} ${monthNames[currentMonth]} a fost eliminată`,
        });
      } catch (error) {
        console.error('Error removing shift:', error);
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut elimina tura',
          variant: 'destructive',
        });
      }
    }
  };

  const handleAddShift = async (doctorId: string, day: number, shiftType: 'day' | 'night') => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    try {
      const newShift = {
        doctor_id: doctorId,
        shift_date: dateStr,
        shift_type: shiftType,
        start_time: shiftType === 'day' ? '08:00' : '20:00',
        end_time: shiftType === 'day' ? '20:00' : '08:00',
      };

      const { data, error } = await supabase.from('shifts').insert(newShift).select().single();

      if (error) throw error;

      onShiftsUpdate([...shifts, data]);
      toast({
        title: 'Tură adăugată',
        description: `Tură de ${shiftType === 'day' ? 'zi' : 'noapte'} adăugată pentru ${day} ${monthNames[currentMonth]}`,
      });
    } catch (error) {
      console.error('Error adding shift:', error);
      toast({
        title: 'Eroare',
        description: 'Nu s-a putut adăuga tura',
        variant: 'destructive',
      });
    }
  };

  const handleToggleLeaveDay = async (doctorId: string, day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existingLeave = leaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

    try {
      if (existingLeave) {
        // Remove leave day
        await supabase.from('leave_days').delete().eq('id', existingLeave.id);
        onLeaveDaysUpdate(leaveDays.filter(l => l.id !== existingLeave.id));
        toast({
          title: 'Concediu eliminat',
          description: `Ziua de concediu din ${day} ${monthNames[currentMonth]} a fost eliminată`,
        });
      } else {
        // Check if we can add more leave days
        if (remainingLeaveDays <= 0) {
          toast({
            title: 'Limită atinsă',
            description: 'Nu mai poți adăuga zile de concediu pentru această lună',
            variant: 'destructive',
          });
          return;
        }

        // Add leave day
        const { data, error } = await supabase
          .from('leave_days')
          .insert({ doctor_id: doctorId, leave_date: dateStr })
          .select()
          .single();

        if (error) throw error;

        onLeaveDaysUpdate([...leaveDays, data]);
        toast({
          title: 'Concediu adăugat',
          description: `Zi de concediu adăugată pentru ${day} ${monthNames[currentMonth]}`,
        });
      }
    } catch (error) {
      console.error('Error toggling leave day:', error);
      toast({
        title: 'Eroare',
        description: 'Nu s-a putut modifica concediul',
        variant: 'destructive',
      });
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

  // Calculate doctor stats for the month
  const getDoctorStats = (doctorId: string) => {
    const doctorShifts = shifts.filter(s => s.doctor_id === doctorId);
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length;
    const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    const doctorLeaveDays = leaveDays.filter(l => l.doctor_id === doctorId).length;
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear);
    const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - doctorLeaveDays);
    
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
                <span className="text-muted-foreground">Zile concediu disponibile: </span>
                <Badge variant={remainingLeaveDays > 0 ? 'default' : 'destructive'}>
                  {remainingLeaveDays} / {possibleLeaveDays}
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
                          {isLeave ? (
                            <button
                              onClick={() => handleToggleLeaveDay(doctor.id, day)}
                              className="w-full h-full flex items-center justify-center bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-xs font-bold hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                              title="Concediu - click pentru a elimina"
                            >
                              C
                            </button>
                          ) : shift ? (
                            <button
                              onClick={() => handleCellClick(doctor.id, day, shift)}
                              className={`w-full h-full flex items-center justify-center text-xs font-bold transition-colors ${
                                shift.shift_type === 'day'
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                                  : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800'
                              }`}
                              title={`${shift.shift_type === 'day' ? 'Tură de zi' : 'Tură de noapte'} - click pentru a elimina`}
                            >
                              {shift.shift_type === 'day' ? 'Z' : 'N'}
                            </button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="w-full h-full min-h-[32px] hover:bg-accent transition-colors"
                                  title="Click pentru a adăuga tură sau concediu"
                                />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center">
                                <DropdownMenuItem onClick={() => handleAddShift(doctor.id, day, 'day')}>
                                  <span className="w-4 h-4 rounded bg-blue-500 mr-2" />
                                  Tură de Zi (Z)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddShift(doctor.id, day, 'night')}>
                                  <span className="w-4 h-4 rounded bg-indigo-500 mr-2" />
                                  Tură de Noapte (N)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleLeaveDay(doctor.id, day)}>
                                  <span className="w-4 h-4 rounded bg-orange-500 mr-2" />
                                  Concediu (C)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
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
