'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, AlertTriangle, X, Trash2 } from 'lucide-react';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import { createClient } from '../../../supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useTranslation } from '@/lib/i18n';

interface ShiftGridCalendarProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  leaveDays: LeaveDay[];
  nationalHolidays: NationalHoliday[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  currentMonth: number;
  currentYear: number;
  userId: string | null;
  onMonthChange: (month: number, year: number) => void;
  onShiftsUpdate: (shifts: Shift[]) => void;
  onLeaveDaysUpdate: (leaveDays: LeaveDay[]) => void;
  onNationalHolidaysUpdate: (holidays: NationalHoliday[]) => void;
}

export default function ShiftGridCalendar({
  doctors,
  teams,
  shifts,
  leaveDays,
  nationalHolidays,
  shiftsPerDay,
  shiftsPerNight,
  currentMonth,
  currentYear,
  userId,
  onMonthChange,
  onShiftsUpdate,
  onLeaveDaysUpdate,
  onNationalHolidaysUpdate,
}: ShiftGridCalendarProps) {
  const [generating, setGenerating] = useState(false);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{
    doctorId: string;
    startDay: number;
    endDay: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{
    doctorId: string;
    days: number[];
    x: number;
    y: number;
  } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { toast } = useToast();

  const { t, tArray, tMessage } = useTranslation();

  const monthNames = tArray('months');

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Count only explicit leave days (bridge days don't count as leave)
  const currentLeaveDaysCount = leaveDays.filter(l => {
    const date = new Date(l.leave_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  // Count bridge days across all doctors for display
  const totalBridgeDaysCount = useMemo(() => {
    let count = 0;
    for (const doctor of doctors) {
      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctor.id, leaveDays, currentMonth, currentYear, nationalHolidays);
      count += bridgeDays.size;
    }
    return count;
  }, [doctors, leaveDays, currentMonth, currentYear, nationalHolidays]);

  // Detect days where too many doctors are on leave/bridge to fill shifts (pre-generation)
  const understaffedDays = useMemo(() => {
    if (doctors.length === 0) return new Map<number, { available: number; required: number }>();
    return SchedulingEngine.computeUnderstaffedDays(
      currentMonth, currentYear, doctors, leaveDays, shiftsPerDay, shiftsPerNight, nationalHolidays
    );
  }, [currentMonth, currentYear, doctors, leaveDays, shiftsPerDay, shiftsPerNight, nationalHolidays]);

  // Detect days where generated shifts don't meet the configured threshold (post-generation)
  const shiftShortfallDays = useMemo(() => {
    const result = new Map<number, { dayCount: number; nightCount: number }>();
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    if (monthShifts.length === 0) return result;

    const byDate = new Map<string, { day: number; night: number }>();
    for (const s of monthShifts) {
      if (!byDate.has(s.shift_date)) byDate.set(s.shift_date, { day: 0, night: 0 });
      const counts = byDate.get(s.shift_date)!;
      if (s.shift_type === 'day') counts.day++;
      else if (s.shift_type === 'night') counts.night++;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const counts = byDate.get(dateStr);
      // Only flag days that have at least some shifts (i.e. schedule was generated)
      // but not enough to meet the threshold
      if (!counts) continue;
      if (counts.day < shiftsPerDay || counts.night < shiftsPerNight) {
        result.set(d, { dayCount: counts.day, nightCount: counts.night });
      }
    }
    return result;
  }, [shifts, currentMonth, currentYear, daysInMonth, shiftsPerDay, shiftsPerNight]);

  // A day is "understaffed" if it fails either the pre-generation or post-generation check
  const isUnderstaffedDay = (day: number): boolean => understaffedDays.has(day) || shiftShortfallDays.has(day);

  // Reactive warnings: combine generation norm warnings with shift shortfall warnings
  const warnings = useMemo(() => {
    const result: string[] = [...generationWarnings];
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    // Add shortfall warnings from actual shift data
    shiftShortfallDays.forEach(({ dayCount, nightCount }, day) => {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      if (dayCount < shiftsPerDay) {
        result.push(`scheduling.engine.understaffedDay::${JSON.stringify({ count: dayCount, required: shiftsPerDay, date: dateStr })}`);
      }
      if (nightCount < shiftsPerNight) {
        result.push(`scheduling.engine.understaffedNight::${JSON.stringify({ count: nightCount, required: shiftsPerNight, date: dateStr })}`);
      }
    });

    // Deduplicate by message content
    return Array.from(new Set(result));
  }, [generationWarnings, shiftShortfallDays, currentMonth, currentYear, shiftsPerDay, shiftsPerNight]);

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
        title: t('common.error'),
        description: t('scheduling.grid.toastNoDoctors'),
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    try {
      // Collect manual shifts for this month — these are preserved across re-generation
      const manualShifts = shifts.filter(
        s => s.is_manual && s.shift_date >= monthStart && s.shift_date <= monthEnd
      );
      const otherMonthShifts = shifts.filter(s => s.shift_date < monthStart || s.shift_date > monthEnd);

      // Clear non-manual shifts from local state immediately so the UI is clean
      onShiftsUpdate([...otherMonthShifts, ...manualShifts]);

      // Collect last few days of previous month to seed rest constraints
      const prevMonthDate = new Date(currentYear, currentMonth, 0); // last day of prev month
      const prevMonthEnd = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthDate.getDate()).padStart(2, '0')}`;
      const prevLookbackDay = Math.max(1, prevMonthDate.getDate() - 2); // last 3 days
      const prevMonthLookback = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevLookbackDay).padStart(2, '0')}`;
      const previousMonthShifts = shifts.filter(
        s => s.shift_date >= prevMonthLookback && s.shift_date <= prevMonthEnd
      );

      const engine = new SchedulingEngine({
        month: currentMonth,
        year: currentYear,
        doctors,
        teams,
        shiftsPerDay,
        shiftsPerNight,
        leaveDays,
        nationalHolidays,
        fixedShifts: manualShifts,
        previousMonthShifts,
      });

      const result = engine.generateSchedule();
      setGenerationWarnings(result.warnings);

      // Delete only non-manual shifts for this month from DB
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
        .eq('is_manual', false);

      if (deleteError) throw deleteError;

      // Insert new generated (non-manual) shifts
      const { error } = await supabase.from('shifts').insert(
        result.shifts.map(({ id, ...shift }) => shift)
      );

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.grid.toastGenerateSuccess', { month: monthNames[currentMonth], year: currentYear }),
      });

      onShiftsUpdate([...otherMonthShifts, ...manualShifts, ...result.shifts]);
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.grid.toastGenerateError'),
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


  const getTeamColor = (doctor: Doctor): string => {
    if (doctor.is_floating) return '#6b7280';
    const team = teams.find(t => t.id === doctor.team_id);
    return team?.color || '#6b7280';
  };

  const getDayOfWeek = (day: number): string => {
    const date = new Date(currentYear, currentMonth, day);
    const dayNames = tArray('daysShort');
    return dayNames[date.getDay()];
  };

  const isWeekend = (day: number): boolean => {
    const date = new Date(currentYear, currentMonth, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  const isNationalHoliday = (day: number): boolean => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return nationalHolidays.some(h => h.holiday_date === dateStr);
  };

  const isNonWorkingDay = (day: number): boolean => {
    return isWeekend(day) || isNationalHoliday(day);
  };

  const isBridgeDay = (doctorId: string, day: number): boolean => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctorId, leaveDays, currentMonth, currentYear, nationalHolidays);
    return bridgeDays.has(dateStr);
  };

  const handleToggleHoliday = async (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = nationalHolidays.find(h => h.holiday_date === dateStr);

    try {
      if (existing) {
        await supabase.from('national_holidays').delete().eq('id', existing.id);
        onNationalHolidaysUpdate(nationalHolidays.filter(h => h.id !== existing.id));
        toast({
          title: t('scheduling.grid.holidayRemovedTitle'),
          description: t('scheduling.grid.holidayRemovedDesc', { day, month: monthNames[currentMonth] }),
        });
      } else {
        const { data, error } = await supabase
          .from('national_holidays')
          .insert({ holiday_date: dateStr, user_id: userId })
          .select()
          .single();
        if (error) throw error;
        onNationalHolidaysUpdate([...nationalHolidays, data]);
        toast({
          title: t('scheduling.grid.holidayAddedTitle'),
          description: t('scheduling.grid.holidayAddedDesc', { day, month: monthNames[currentMonth] }),
        });
      }
    } catch (error) {
      console.error('Error toggling holiday:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.holidayToggleError'), variant: 'destructive' });
    }
  };

  // Calculate doctor stats for the current month only.
  const getDoctorStats = (doctorId: string) => {
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const doctorShifts = shifts.filter(s => s.doctor_id === doctorId && s.shift_date.startsWith(monthPrefix));
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length;
    const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    const doctorLeaveDays = leaveDays.filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix)).length;
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear, nationalHolidays);
    const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays - SCHEDULING_CONSTANTS.SHIFT_DURATION * doctorLeaveDays;

    return { dayShifts, nightShifts, totalHours, baseNorm };
  };

  // Compute rest-period violations: a Set of "doctorId:dateStr" keys for cells that violate rest rules
  const restViolations = useMemo(() => {
    const violations = new Set<string>();
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));

    // Group by doctor
    const byDoctor = new Map<string, Shift[]>();
    for (const s of monthShifts) {
      if (!byDoctor.has(s.doctor_id)) byDoctor.set(s.doctor_id, []);
      byDoctor.get(s.doctor_id)!.push(s);
    }

    byDoctor.forEach((doctorShifts, doctorId) => {
      const sorted = doctorShifts.sort((a, b) =>
        new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const hoursBetween =
          (new Date(curr.shift_date).getTime() - new Date(prev.shift_date).getTime()) / (1000 * 60 * 60);

        const minRest = prev.shift_type === 'night'
          ? SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST
          : SCHEDULING_CONSTANTS.DAY_SHIFT_REST;

        if (hoursBetween < minRest) {
          // Mark both the preceding shift and the violating shift
          violations.add(`${doctorId}:${prev.shift_date}`);
          violations.add(`${doctorId}:${curr.shift_date}`);
        }
      }
    });

    return violations;
  }, [shifts, currentYear, currentMonth]);

  const hasRestViolation = (doctorId: string, day: number): boolean => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return restViolations.has(`${doctorId}:${dateStr}`);
  };

  // --- Drag selection helpers ---
  const isCellSelected = (doctorId: string, day: number): boolean => {
    if (!dragState || dragState.doctorId !== doctorId) return false;
    const min = Math.min(dragState.startDay, dragState.endDay);
    const max = Math.max(dragState.startDay, dragState.endDay);
    return day >= min && day <= max;
  };

  const handleCellMouseDown = (doctorId: string, day: number, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectionPopup(null);
    setIsDragging(true);
    setDragState({ doctorId, startDay: day, endDay: day });
  };

  const handleCellMouseEnter = (doctorId: string, day: number) => {
    if (!isDragging || !dragState) return;
    if (dragState.doctorId !== doctorId) return;
    setDragState(prev => prev ? { ...prev, endDay: day } : null);
  };

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragState) return;
    setIsDragging(false);

    const selectedDays = (() => {
      const min = Math.min(dragState.startDay, dragState.endDay);
      const max = Math.max(dragState.startDay, dragState.endDay);
      return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    })();

    setSelectionPopup({
      doctorId: dragState.doctorId,
      days: selectedDays,
      x: e.clientX,
      y: e.clientY,
    });
  }, [isDragging, dragState]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionPopup && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSelectionPopup(null);
        setDragState(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectionPopup]);

  // Check if any selected cell has an assignment (shift or leave)
  const selectionHasAssignments = useMemo(() => {
    if (!selectionPopup) return false;
    const { doctorId, days: selectedDays } = selectionPopup;
    return selectedDays.some(day => {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return shifts.some(s => s.doctor_id === doctorId && s.shift_date === dateStr) ||
             leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr);
    });
  }, [selectionPopup, shifts, leaveDays, currentYear, currentMonth]);

  // Batch action: apply the same action to multiple days for one doctor
  const handleBatchAction = async (action: 'day' | 'night' | 'leave') => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;

    setSelectionPopup(null);
    setDragState(null);

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];

      for (const day of selectedDays) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // When applying leave, skip non-working days (weekends/holidays) —
        // they will automatically become bridge days between adjacent leave days
        if (action === 'leave' && isNonWorkingDay(day)) continue;

        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        // Remove existing shift if present and different from action
        if (existingShift) {
          if (action === existingShift.shift_type) continue; // already has this type, skip
          await supabase.from('shifts').delete().eq('id', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }

        // Remove existing leave if present and action is not leave
        if (existingLeave) {
          if (action === 'leave') continue; // already on leave, skip
          await supabase.from('leave_days').delete().eq('id', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);
        }

        // Add new state
        if (action === 'leave') {
          const { data, error } = await supabase
            .from('leave_days')
            .insert({ doctor_id: doctorId, leave_date: dateStr })
            .select()
            .single();
          if (error) throw error;
          updatedLeaveDays = [...updatedLeaveDays, data];
        } else {
          const { data, error } = await supabase
            .from('shifts')
            .upsert({
              doctor_id: doctorId,
              shift_date: dateStr,
              shift_type: action,
              start_time: action === 'day' ? '08:00' : '20:00',
              end_time: action === 'day' ? '20:00' : '08:00',
              is_manual: true,
            }, { onConflict: 'doctor_id,shift_date' })
            .select()
            .single();
          if (error) throw error;
          updatedShifts = [...updatedShifts, data];
        }
      }

      onShiftsUpdate(updatedShifts);
      onLeaveDaysUpdate(updatedLeaveDays);

      const label = action === 'day' ? t('scheduling.grid.dayShift') : action === 'night' ? t('scheduling.grid.nightShift') : t('scheduling.grid.leave');
      toast({
        title: t('scheduling.grid.batchApplied', { label, count: selectedDays.length }),
        description: t('scheduling.grid.batchAppliedDesc', { label, start: selectedDays[0], end: selectedDays[selectedDays.length - 1], month: monthNames[currentMonth] }),
      });
    } catch (error) {
      console.error('Error applying batch action:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearCellsError'), variant: 'destructive' });
    }
  };

  // Clear all assignments (shifts and leave days) from selected cells
  const handleBatchClear = async () => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;

    setSelectionPopup(null);
    setDragState(null);

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];

      for (const day of selectedDays) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        if (existingShift) {
          await supabase.from('shifts').delete().eq('id', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }
        if (existingLeave) {
          await supabase.from('leave_days').delete().eq('id', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);
        }
      }

      onShiftsUpdate(updatedShifts);
      onLeaveDaysUpdate(updatedLeaveDays);

      toast({
        title: t('scheduling.grid.clearedTitle'),
        description: t('scheduling.grid.clearedDesc', { start: selectedDays[0], end: selectedDays[selectedDays.length - 1], month: monthNames[currentMonth] }),
      });
    } catch (error) {
      console.error('Error clearing cells:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearError'), variant: 'destructive' });
    }
  };

  // Clear all shifts and leave days for the current month
  const handleClearMonth = async () => {
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    try {
      const { error: shiftError } = await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd);
      if (shiftError) throw shiftError;

      const { error: leaveError } = await supabase
        .from('leave_days')
        .delete()
        .gte('leave_date', monthStart)
        .lte('leave_date', monthEnd);
      if (leaveError) throw leaveError;

      onShiftsUpdate(shifts.filter(s => s.shift_date < monthStart || s.shift_date > monthEnd));
      onLeaveDaysUpdate(leaveDays.filter(l => l.leave_date < monthStart || l.leave_date > monthEnd));

      toast({
        title: t('scheduling.grid.clearedMonthTitle'),
        description: t('scheduling.grid.clearedMonthDesc', { month: monthNames[currentMonth], year: currentYear }),
      });
    } catch (error) {
      console.error('Error clearing month:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearMonthError'), variant: 'destructive' });
    }
  };

  // Helper to extract the letter between parentheses from a label string, e.g. "Day Shift (D)" -> "D"
  const extractCellLetter = (label: string, fallback: string): string => {
    return label.match(/\((.)\)/)?.[1] || fallback;
  };

  const dayShiftLetter = extractCellLetter(t('scheduling.grid.dayShiftLabel'), 'Z');
  const nightShiftLetter = extractCellLetter(t('scheduling.grid.nightShiftLabel'), 'N');
  const leaveLetter = extractCellLetter(t('scheduling.grid.leaveLabel'), 'C');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {t('scheduling.grid.title')}
              </CardTitle>
              <CardDescription>
                {t('scheduling.grid.description')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm flex items-center gap-3">
                <span>
                  <span className="text-muted-foreground">{t('scheduling.grid.leaveDaysThisMonth') + ': '}</span>
                  <Badge variant="outline">
                    {currentLeaveDaysCount}
                  </Badge>
                </span>
                {totalBridgeDaysCount > 0 && (
                  <span>
                    <span className="text-muted-foreground">{t('scheduling.grid.bridgeDaysThisMonth') + ': '}</span>
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30">
                      {totalBridgeDaysCount}
                    </Badge>
                  </span>
                )}
              </div>
              <Button variant="outline" onClick={handleClearMonth}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('scheduling.grid.clearMonth')}
              </Button>
              <Button onClick={handleGenerateSchedule} disabled={generating}>
                <Sparkles className="h-4 w-4 mr-2" />
                {generating ? t('scheduling.grid.generating') : t('scheduling.grid.generate')}
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

          <ScrollArea className="w-full">
            <div className="min-w-max">
              {/* Header row with days */}
              <div className="flex border-b">
                <div className="w-48 min-w-48 p-2 font-semibold border-r bg-muted sticky left-0 z-10">
                  {t('scheduling.grid.doctorColumn')}
                </div>
                <div className="w-20 min-w-20 p-2 font-semibold border-r bg-muted text-center text-xs">
                  {t('scheduling.grid.hoursColumn')}
                </div>
                {days.map(day => (
                  <div
                    key={day}
                    className={`w-10 min-w-10 p-1 text-center border-r text-xs cursor-pointer select-none transition-colors ${
                      isUnderstaffedDay(day)
                        ? 'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-800'
                        : isNationalHoliday(day)
                        ? 'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-300 dark:hover:bg-green-800'
                        : isWeekend(day)
                        ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                        : 'hover:bg-accent'
                    }`}
                    title={isUnderstaffedDay(day)
                      ? t('scheduling.grid.understaffedWarning', { day, ...understaffedDays.get(day)! })
                      : t('scheduling.grid.holidayToggleTooltip')}
                    onClick={() => handleToggleHoliday(day)}
                  >
                    <div className="font-semibold">{day}</div>
                    <div>{getDayOfWeek(day)}</div>
                  </div>
                ))}
              </div>

              {/* Doctor rows */}
              {sortedDoctors.map(doctor => {
                const stats = getDoctorStats(doctor.id);
                const teamColor = getTeamColor(doctor);

                return (
                  <div key={doctor.id} className="flex border-b hover:bg-slate-100">
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
                      const selected = isCellSelected(doctor.id, day);
                      const violation = hasRestViolation(doctor.id, day);
                      const bridge = isBridgeDay(doctor.id, day);
                      const nonWorking = isNonWorkingDay(day);

                      return (
                        <div
                          key={day}
                          className={`w-10 min-w-10 border-r flex items-center justify-center relative ${
                            isUnderstaffedDay(day) ? 'bg-red-50 dark:bg-red-950/30' : isNationalHoliday(day) ? 'bg-rose-50 dark:bg-rose-950/30' : isWeekend(day) ? 'bg-muted/50' : ''
                          }`}
                        >
                          <button
                            className={`w-full h-full min-h-[32px] flex items-center justify-center text-xs font-bold transition-colors select-none ${
                              selected
                                ? 'ring-2 ring-primary ring-inset bg-primary/20'
                                : violation
                                ? 'bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 ring-2 ring-red-500 ring-inset'
                                : bridge
                                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400'
                                : isLeave
                                ? nonWorking
                                  ? 'bg-orange-50 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800/70'
                                  : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800'
                                : shift?.shift_type === 'day'
                                ? nonWorking
                                  ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/70'
                                  : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                                : shift?.shift_type === 'night'
                                ? nonWorking
                                  ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/70'
                                  : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800'
                                : nonWorking
                                ? 'bg-muted/60 hover:bg-muted/80'
                                : 'hover:bg-accent'
                            } ${shift?.is_manual ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}
                            title={shift?.is_manual ? t('scheduling.grid.manualShiftTooltip') : violation ? t('scheduling.grid.insufficientRestTooltip') : bridge ? t('scheduling.grid.bridgeDayTooltip') : t('scheduling.grid.multiSelectTooltip')}
                            onMouseDown={(e) => handleCellMouseDown(doctor.id, day, e)}
                            onMouseEnter={() => handleCellMouseEnter(doctor.id, day)}
                          >
                            {bridge ? '·' : isLeave ? leaveLetter : shift?.shift_type === 'day' ? dayShiftLetter : shift?.shift_type === 'night' ? nightShiftLetter : ''}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Selection popup */}
          {selectionPopup && (() => {
            const POPUP_W = 190;
            const POPUP_H = selectionHasAssignments ? 200 : 160;
            const finalLeft = selectionPopup.x + POPUP_W > window.innerWidth
              ? selectionPopup.x - POPUP_W
              : selectionPopup.x;
            const finalTop = selectionPopup.y + 8 + POPUP_H > window.innerHeight
              ? selectionPopup.y - POPUP_H
              : selectionPopup.y + 8;
            return (
            <div
              ref={popupRef}
              className="fixed z-50 bg-popover border rounded-md shadow-md p-1 min-w-[180px]"
              style={{
                left: finalLeft,
                top: finalTop,
              }}
            >
              <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1">
                {selectionPopup.days.length} {selectionPopup.days.length === 1 ? t('scheduling.grid.selectedSingular') : t('scheduling.grid.selectedPlural')}
              </div>
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
                onClick={() => handleBatchAction('day')}
              >
                <span className="w-4 h-4 rounded bg-blue-500 flex-shrink-0" />
                {t('scheduling.grid.dayShiftLabel')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
                onClick={() => handleBatchAction('night')}
              >
                <span className="w-4 h-4 rounded bg-indigo-500 flex-shrink-0" />
                {t('scheduling.grid.nightShiftLabel')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
                onClick={() => handleBatchAction('leave')}
              >
                <span className="w-4 h-4 rounded bg-orange-500 flex-shrink-0" />
                {t('scheduling.grid.leaveLabel')}
              </button>
              {selectionHasAssignments && (
                <>
                  <div className="border-t my-1" />
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 text-destructive cursor-pointer"
                    onClick={handleBatchClear}
                  >
                    <X className="w-4 h-4 flex-shrink-0" />
                    {t('scheduling.grid.clearSelection')}
                  </button>
                </>
              )}
            </div>
            );
          })()}

          {/* Warnings — shown below table */}
          {warnings.length > 0 && (
            <Alert className="mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <ul className="list-disc list-inside">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>{tMessage(warning)}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {understaffedDays.size > 0 && (
            <Alert className="mt-4 border-red-500 bg-red-50 dark:bg-red-950">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <div className="font-medium mb-1">{t('scheduling.grid.understaffedDaysTitle')}</div>
                <ul className="list-disc list-inside">
                  {Array.from(understaffedDays.entries()).map(([day, { available, required }]) => (
                    <li key={day}>{t('scheduling.grid.understaffedWarning', { day, available, required })}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Legend */}
          <div className="mt-6 flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-bold">{dayShiftLetter}</div>
              <span className="text-muted-foreground">{t('scheduling.grid.dayShiftLegend')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 rounded flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold">{nightShiftLetter}</div>
              <span className="text-muted-foreground">{t('scheduling.grid.nightShiftLegend')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-orange-100 dark:bg-orange-900 rounded flex items-center justify-center text-orange-700 dark:text-orange-300 text-xs font-bold">{leaveLetter}</div>
              <span className="text-muted-foreground">{t('scheduling.grid.leaveLegend')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-rose-200 dark:bg-rose-900 rounded flex items-center justify-center text-rose-800 dark:text-rose-200 text-xs font-bold">H</div>
              <span className="text-muted-foreground">{t('scheduling.grid.holidayLegend')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-50 dark:bg-amber-900/30 rounded flex items-center justify-center text-amber-500 dark:text-amber-400 text-xs font-bold">·</div>
              <span className="text-muted-foreground">{t('scheduling.grid.bridgeDayLegend')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">F</Badge>
              <span className="text-muted-foreground">{t('scheduling.grid.floatingBadge')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-red-200 dark:bg-red-900/60 rounded ring-2 ring-red-500 flex items-center justify-center text-red-800 dark:text-red-200 text-xs font-bold">!</div>
              <span className="text-muted-foreground">{t('scheduling.grid.insufficientRest')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
