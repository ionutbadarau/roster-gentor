'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import { useSchedulingWorker } from '@/lib/scheduling/use-scheduling-worker';
import { createClient } from '../../../supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { formatDateString, getMonthPrefix, getMonthBoundary, groupShiftsByDoctor } from '@/lib/scheduling/shift-utils';
import { upsertShift, createLeaveDay, deleteRecord, deleteMonthShifts, deleteMonthLeaveDays } from '@/lib/scheduling/shift-data-service';
import ShiftGridHeader from './shift-grid-header';
import ShiftGridDoctorRow from './shift-grid-doctor-row';
import ShiftSelectionPopup, { type SelectionPopupData } from './shift-selection-popup';
import ShiftGridWarnings from './shift-grid-warnings';
import ShiftGridLegend from './shift-grid-legend';

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
  const { generate: generateInWorker } = useSchedulingWorker();
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{
    doctorId: string;
    startDay: number;
    endDay: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupData | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { toast } = useToast();

  const { t, tArray } = useTranslation();
  const monthNames = tArray('months');

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthPrefix = getMonthPrefix(currentYear, currentMonth);

  // Count only explicit leave days (bridge days don't count as leave)
  const currentLeaveDaysCount = leaveDays.filter(l => {
    const date = new Date(l.leave_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear && l.leave_type !== 'bridge';
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

  // Check if a schedule has been generated for the current month
  const hasGeneratedForMonth = useMemo(() => {
    return shifts.some(s => s.shift_date.startsWith(monthPrefix));
  }, [shifts, monthPrefix]);

  // Detect days where too many doctors are on leave/bridge to fill shifts (pre-generation)
  const understaffedDays = useMemo(() => {
    if (doctors.length === 0 || !hasGeneratedForMonth) return new Map<number, { available: number; required: number }>();
    return SchedulingEngine.computeUnderstaffedDays(
      currentMonth, currentYear, doctors, leaveDays, shiftsPerDay, shiftsPerNight, nationalHolidays
    );
  }, [currentMonth, currentYear, doctors, leaveDays, shiftsPerDay, shiftsPerNight, nationalHolidays, hasGeneratedForMonth]);

  // Detect days where generated shifts don't meet the configured threshold (post-generation)
  const shiftShortfallDays = useMemo(() => {
    const result = new Map<number, { dayCount: number; nightCount: number }>();
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    if (monthShifts.length === 0) return result;

    const byDate = new Map<string, { day: number; night: number }>();
    for (const s of monthShifts) {
      if (!byDate.has(s.shift_date)) byDate.set(s.shift_date, { day: 0, night: 0 });
      const counts = byDate.get(s.shift_date)!;
      if (s.shift_type === '24h') { counts.day++; counts.night++; }
      else if (s.shift_type === 'day') counts.day++;
      else if (s.shift_type === 'night') counts.night++;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateString(currentYear, currentMonth, d);
      const counts = byDate.get(dateStr);
      if (!counts) continue;
      if (counts.day < shiftsPerDay || counts.night < shiftsPerNight) {
        result.set(d, { dayCount: counts.day, nightCount: counts.night });
      }
    }
    return result;
  }, [shifts, currentMonth, currentYear, daysInMonth, shiftsPerDay, shiftsPerNight, monthPrefix]);

  const isUnderstaffedDay = (day: number): boolean => understaffedDays.has(day) || shiftShortfallDays.has(day);

  // Reactive norm warnings: recompute from current shifts whenever edits happen
  const normWarnings = useMemo(() => {
    if (!hasGeneratedForMonth) return [];
    const result: string[] = [];
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear, nationalHolidays);

    for (const doc of doctors) {
      if (doc.is_optional) continue;
      const docShifts = monthShifts.filter(s => s.doctor_id === doc.id);
      const shifts24h = docShifts.filter(s => s.shift_type === '24h').length;
      const dayCount = docShifts.filter(s => s.shift_type === 'day').length + shifts24h;
      const nightCount = docShifts.filter(s => s.shift_type === 'night').length + shifts24h;
      const totalHours = (dayCount + nightCount) * SCHEDULING_CONSTANTS.SHIFT_DURATION;

      const docLeave = leaveDays.filter(l => l.doctor_id === doc.id && l.leave_date.startsWith(monthPrefix) && l.leave_type !== 'bridge').length;
      const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - docLeave);

      if (totalHours < baseNorm) {
        const shortfall = baseNorm - totalHours;
        const requiredLeaveDays = Math.ceil(shortfall / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY);
        result.push(`scheduling.engine.normWarning::${JSON.stringify({ name: doc.name, days: requiredLeaveDays })}`);
      }
    }
    return result;
  }, [shifts, doctors, leaveDays, monthPrefix, currentMonth, currentYear, nationalHolidays, hasGeneratedForMonth]);

  // Reactive rest violation warnings: recompute from current shifts
  const restViolationWarnings = useMemo(() => {
    if (!hasGeneratedForMonth) return [];
    const result: string[] = [];
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    const byDoctor = groupShiftsByDoctor(monthShifts);

    byDoctor.forEach((doctorShifts, doctorId) => {
      const doctor = doctors.find(d => d.id === doctorId);
      if (!doctor) return;
      const sorted = [...doctorShifts].sort((a, b) =>
        new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const hoursBetween = (new Date(curr.shift_date).getTime() - new Date(prev.shift_date).getTime()) / (1000 * 60 * 60);
        const minRest = prev.shift_type === '24h' ? SCHEDULING_CONSTANTS.SHIFT_24H_REST
          : prev.shift_type === 'night' ? SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST
          : SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
        if (hoursBetween < minRest) {
          result.push(`scheduling.engine.restViolation::${JSON.stringify({ name: doctor.name, date: curr.shift_date, hours: hoursBetween, required: minRest })}`);
        }
      }
    });
    return result;
  }, [shifts, doctors, monthPrefix, hasGeneratedForMonth]);

  // Reactive warnings: combine all warning sources
  const warnings = useMemo(() => {
    const result: string[] = [
      ...generationWarnings,
      ...normWarnings,
      ...restViolationWarnings,
    ];

    shiftShortfallDays.forEach(({ dayCount, nightCount }, day) => {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      if (dayCount < shiftsPerDay) {
        result.push(`scheduling.engine.understaffedDay::${JSON.stringify({ count: dayCount, required: shiftsPerDay, date: dateStr })}`);
      }
      if (nightCount < shiftsPerNight) {
        result.push(`scheduling.engine.understaffedNight::${JSON.stringify({ count: nightCount, required: shiftsPerNight, date: dateStr })}`);
      }
    });

    return Array.from(new Set(result));
  }, [generationWarnings, normWarnings, restViolationWarnings, shiftShortfallDays, currentMonth, currentYear, shiftsPerDay, shiftsPerNight]);

  // Sort doctors by display_order (manual sort from config)
  const sortedDoctors = useMemo(() => {
    return [...doctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [doctors]);

  // --- Navigation ---
  const handlePreviousMonth = () => {
    if (currentMonth === 0) onMonthChange(11, currentYear - 1);
    else onMonthChange(currentMonth - 1, currentYear);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) onMonthChange(0, currentYear + 1);
    else onMonthChange(currentMonth + 1, currentYear);
  };

  // --- Schedule generation ---
  const handleGenerateSchedule = async () => {
    if (doctors.length === 0) {
      toast({ title: t('common.error'), description: t('scheduling.grid.toastNoDoctors'), variant: 'destructive' });
      return;
    }

    setGenerating(true);
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      const manualShifts = shifts.filter(s => s.is_manual && s.shift_date >= monthStart && s.shift_date <= monthEnd);
      const otherMonthShifts = shifts.filter(s => s.shift_date < monthStart || s.shift_date > monthEnd);
      onShiftsUpdate([...otherMonthShifts, ...manualShifts]);

      // Collect last few days of previous month to seed rest constraints
      const prevMonthDate = new Date(currentYear, currentMonth, 0);
      const prevMonthEnd = formatDateString(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevMonthDate.getDate());
      const prevLookbackDay = Math.max(1, prevMonthDate.getDate() - 2);
      const prevMonthLookback = formatDateString(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevLookbackDay);
      const previousMonthShifts = shifts.filter(s => s.shift_date >= prevMonthLookback && s.shift_date <= prevMonthEnd);

      const result = await generateInWorker({
        month: currentMonth,
        year: currentYear,
        doctors, teams, shiftsPerDay, shiftsPerNight, leaveDays, nationalHolidays,
        fixedShifts: manualShifts,
        previousMonthShifts,
      });
      setGenerationWarnings(result.warnings.filter(w =>
        !w.startsWith('scheduling.engine.normWarning') &&
        !w.startsWith('scheduling.engine.understaffed')
      ));

      // Delete only non-manual shifts for this month from DB
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
        .eq('is_manual', false);
      if (deleteError) throw deleteError;

      // Deduplicate by (doctor_id, shift_date) – keep last entry so repair-pass
      // overrides greedy-pass when both produce a shift for the same slot.
      const deduped = new Map<string, Omit<Shift, 'id'>>();
      for (const { id, is_forced_coverage, ...shift } of result.shifts) {
        deduped.set(`${shift.doctor_id}:${shift.shift_date}`, shift);
      }
      const { error } = await supabase.from('shifts').upsert(
        Array.from(deduped.values()),
        { onConflict: 'doctor_id,shift_date' },
      );
      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.grid.toastGenerateSuccess', { month: monthNames[currentMonth], year: currentYear }),
      });

      onShiftsUpdate([...otherMonthShifts, ...manualShifts, ...result.shifts]);
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastGenerateError'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // --- Day/cell query helpers ---
  const getShiftForDoctorAndDay = (doctorId: string, day: number): Shift | undefined => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  };

  const isLeaveDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type !== 'bridge');
  };

  const isManualBridgeDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type === 'bridge');
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
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return nationalHolidays.some(h => h.holiday_date === dateStr);
  };

  const isNonWorkingDay = (day: number): boolean => isWeekend(day) || isNationalHoliday(day);

  const isBridgeDay = (doctorId: string, day: number): boolean => {
    if (isManualBridgeDay(doctorId, day)) return true;
    const dateStr = formatDateString(currentYear, currentMonth, day);
    const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctorId, leaveDays, currentMonth, currentYear, nationalHolidays);
    return bridgeDays.has(dateStr);
  };

  const handleToggleHoliday = async (day: number) => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
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

  // --- Doctor stats ---
  const getDoctorStats = (doctorId: string) => {
    const doctorShifts = shifts.filter(s => s.doctor_id === doctorId && s.shift_date.startsWith(monthPrefix));
    const shifts24h = doctorShifts.filter(s => s.shift_type === '24h').length;
    const dayShifts = doctorShifts.filter(s => s.shift_type === 'day').length + shifts24h;
    const nightShifts = doctorShifts.filter(s => s.shift_type === 'night').length + shifts24h;
    const totalHours = (dayShifts + nightShifts) * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    const doctorLeaveDays = leaveDays.filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix) && l.leave_type !== 'bridge').length;
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(currentMonth, currentYear, nationalHolidays);
    const baseNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - doctorLeaveDays);

    return { dayShifts, nightShifts, totalHours, baseNorm };
  };

  // --- Rest violations ---
  const restViolations = useMemo(() => {
    const violations = new Set<string>();
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    const byDoctor = groupShiftsByDoctor(monthShifts);

    byDoctor.forEach((doctorShifts, doctorId) => {
      const sorted = doctorShifts.sort((a, b) =>
        new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const hoursBetween = (new Date(curr.shift_date).getTime() - new Date(prev.shift_date).getTime()) / (1000 * 60 * 60);
        const minRest = prev.shift_type === '24h' ? SCHEDULING_CONSTANTS.SHIFT_24H_REST : prev.shift_type === 'night' ? SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST : SCHEDULING_CONSTANTS.DAY_SHIFT_REST;

        if (hoursBetween < minRest) {
          violations.add(`${doctorId}:${prev.shift_date}`);
          violations.add(`${doctorId}:${curr.shift_date}`);
        }
      }
    });

    return violations;
  }, [shifts, monthPrefix]);

  const hasRestViolation = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return restViolations.has(`${doctorId}:${dateStr}`);
  };

  // --- Drag selection ---
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

    const min = Math.min(dragState.startDay, dragState.endDay);
    const max = Math.max(dragState.startDay, dragState.endDay);
    const selectedDays = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    setSelectionPopup({ doctorId: dragState.doctorId, days: selectedDays, x: e.clientX, y: e.clientY });
  }, [isDragging, dragState]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

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

  const selectionHasAssignments = useMemo(() => {
    if (!selectionPopup) return false;
    const { doctorId, days: selectedDays } = selectionPopup;
    return selectedDays.some(day => {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      return shifts.some(s => s.doctor_id === doctorId && s.shift_date === dateStr) ||
             leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr);
    });
  }, [selectionPopup, shifts, leaveDays, currentYear, currentMonth]);

  const selectionHasBridgeCandidates = useMemo(() => {
    if (!selectionPopup) return false;
    const { doctorId, days: selectedDays } = selectionPopup;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthPrefix = getMonthPrefix(currentYear, currentMonth);
    const doctorLeaves = new Set(
      leaveDays
        .filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix))
        .map(l => l.leave_date)
    );
    const holidaySet = new Set(nationalHolidays.map(h => h.holiday_date));

    const isNonWorkingDate = (d: number) => {
      const date = new Date(currentYear, currentMonth, d);
      const dow = date.getDay();
      return dow === 0 || dow === 6 || holidaySet.has(formatDateString(currentYear, currentMonth, d));
    };

    // Check if a non-working day has leave adjacent on at least one side
    const hasAdjacentLeave = (day: number): boolean => {
      // Look backward through consecutive non-working days for a leave day
      for (let d = day - 1; d >= 1; d--) {
        const ds = formatDateString(currentYear, currentMonth, d);
        if (doctorLeaves.has(ds)) return true;
        if (!isNonWorkingDate(d)) break;
      }
      // Look forward
      for (let d = day + 1; d <= daysInMonth; d++) {
        const ds = formatDateString(currentYear, currentMonth, d);
        if (doctorLeaves.has(ds)) return true;
        if (!isNonWorkingDate(d)) break;
      }
      return false;
    };

    return selectedDays.some(day => isNonWorkingDay(day) && hasAdjacentLeave(day));
  }, [selectionPopup, currentYear, currentMonth, nationalHolidays, leaveDays]);

  // --- Batch actions ---
  const handleBatchAction = async (action: 'day' | 'night' | '24h' | 'leave' | 'bridge') => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;
    setSelectionPopup(null);
    setDragState(null);

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];

      for (const day of selectedDays) {
        const dateStr = formatDateString(currentYear, currentMonth, day);

        if (action === 'bridge' && !isNonWorkingDay(day)) continue;

        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        if (existingShift) {
          if (action !== 'leave' && action !== 'bridge' && action === existingShift.shift_type) continue;
          await deleteRecord(supabase, 'shifts', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }

        if (existingLeave) {
          const existingType = existingLeave.leave_type || 'regular';
          const targetType = action === 'bridge' ? 'bridge' : 'regular';
          if ((action === 'leave' || action === 'bridge') && existingType === targetType) continue;
          await deleteRecord(supabase, 'leave_days', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);
        }

        if (action === 'leave' || action === 'bridge') {
          const leaveType = action === 'bridge' ? 'bridge' : 'regular';
          const data = await createLeaveDay(supabase, doctorId, dateStr, leaveType);
          updatedLeaveDays = [...updatedLeaveDays, data];
        } else {
          const data = await upsertShift(supabase, doctorId, dateStr, action);
          updatedShifts = [...updatedShifts, data];
        }
      }

      onShiftsUpdate(updatedShifts);
      onLeaveDaysUpdate(updatedLeaveDays);

      const label = action === '24h' ? t('scheduling.grid.shift24h') : action === 'day' ? t('scheduling.grid.dayShift') : action === 'night' ? t('scheduling.grid.nightShift') : action === 'bridge' ? t('scheduling.grid.bridgeDayLegend') : t('scheduling.grid.leave');
      toast({
        title: t('scheduling.grid.batchApplied', { label, count: selectedDays.length }),
        description: t('scheduling.grid.batchAppliedDesc', { label, start: selectedDays[0], end: selectedDays[selectedDays.length - 1], month: monthNames[currentMonth] }),
      });
    } catch (error) {
      console.error('Error applying batch action:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearCellsError'), variant: 'destructive' });
    }
  };

  const handleBatchClear = async () => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;
    setSelectionPopup(null);
    setDragState(null);

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];

      for (const day of selectedDays) {
        const dateStr = formatDateString(currentYear, currentMonth, day);
        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        if (existingShift) {
          await deleteRecord(supabase, 'shifts', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }
        if (existingLeave) {
          await deleteRecord(supabase, 'leave_days', existingLeave.id);
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

  const handleClearMonth = async () => {
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      await deleteMonthShifts(supabase, monthStart, monthEnd);

      onShiftsUpdate(shifts.filter(s => s.shift_date < monthStart || s.shift_date > monthEnd));

      toast({
        title: t('scheduling.grid.clearedMonthTitle'),
        description: t('scheduling.grid.clearedMonthDesc', { month: monthNames[currentMonth], year: currentYear }),
      });
    } catch (error) {
      console.error('Error clearing month:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearMonthError'), variant: 'destructive' });
    }
  };

  // --- Cell letter extraction ---
  const extractCellLetter = (label: string, fallback: string): string => {
    return label.match(/\((.+?)\)/)?.[1] || fallback;
  };

  const dayShiftLetter = extractCellLetter(t('scheduling.grid.dayShiftLabel'), 'Z');
  const nightShiftLetter = extractCellLetter(t('scheduling.grid.nightShiftLabel'), 'N');
  const leaveLetter = extractCellLetter(t('scheduling.grid.leaveLabel'), 'C');
  const shift24hLetter = extractCellLetter(t('scheduling.grid.shift24hLabel'), 'DN');

  return (
    <div className="space-y-4">
      <Card>
        <ShiftGridHeader
          currentMonth={currentMonth}
          currentYear={currentYear}
          currentLeaveDaysCount={currentLeaveDaysCount}
          totalBridgeDaysCount={totalBridgeDaysCount}
          generating={generating}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onGenerate={handleGenerateSchedule}
          onClearMonth={handleClearMonth}
        />
        <CardContent className="relative">
          {generating && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-lg font-medium">{t('scheduling.grid.generatingMessage')}</span>
              </div>
            </div>
          )}
          <ScrollArea className="w-full">
            <div className="min-w-max">
              {/* Header row with days */}
              <div className="flex border-b">
                <div className="w-48 min-w-48 p-2 font-semibold border-r bg-muted sticky left-0 z-10">
                  {t('scheduling.grid.doctorColumn')}
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
                <div className="w-20 min-w-20 p-2 font-semibold border-r bg-muted text-center text-xs">
                  {t('scheduling.grid.hoursColumn')}
                </div>
              </div>

              {/* Doctor rows */}
              {sortedDoctors.map(doctor => (
                <ShiftGridDoctorRow
                  key={doctor.id}
                  doctor={doctor}
                  teamColor={getTeamColor(doctor)}
                  stats={getDoctorStats(doctor.id)}
                  days={days}
                  dayShiftLetter={dayShiftLetter}
                  nightShiftLetter={nightShiftLetter}
                  leaveLetter={leaveLetter}
                  shift24hLetter={shift24hLetter}
                  getShiftForDay={(day) => getShiftForDoctorAndDay(doctor.id, day)}
                  isLeaveDay={(day) => isLeaveDay(doctor.id, day)}
                  isCellSelected={(day) => isCellSelected(doctor.id, day)}
                  hasRestViolation={(day) => hasRestViolation(doctor.id, day)}
                  isBridgeDay={(day) => isBridgeDay(doctor.id, day)}
                  isNonWorkingDay={isNonWorkingDay}
                  isUnderstaffedDay={isUnderstaffedDay}
                  isNationalHoliday={isNationalHoliday}
                  isWeekend={isWeekend}
                  onCellMouseDown={(day, e) => handleCellMouseDown(doctor.id, day, e)}
                  onCellMouseEnter={(day) => handleCellMouseEnter(doctor.id, day)}
                  hasGenerated={hasGeneratedForMonth}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {selectionPopup && (
            <ShiftSelectionPopup
              ref={popupRef}
              popup={selectionPopup}
              hasAssignments={selectionHasAssignments}
              hasBridgeCandidates={selectionHasBridgeCandidates}
              onBatchAction={handleBatchAction}
              onBatchClear={handleBatchClear}
            />
          )}

          <ShiftGridWarnings warnings={warnings} understaffedDays={understaffedDays} />
          <ShiftGridLegend dayShiftLetter={dayShiftLetter} nightShiftLetter={nightShiftLetter} leaveLetter={leaveLetter} shift24hLetter={shift24hLetter} />
        </CardContent>
      </Card>
    </div>
  );
}
