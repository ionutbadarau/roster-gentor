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
import { formatDateString, getMonthPrefix, getMonthBoundary, groupShiftsByDoctor, getShiftStartMs, getShiftEndMs, getRestHours } from '@/lib/scheduling/shift-utils';
import { assignDispatch } from '@/lib/scheduling/dispatch-assignment';
import { equalizeShifts } from '@/lib/scheduling/equalize-shifts';
import { upsertShift, createLeaveDay, deleteRecord, deleteMonthShifts, deleteMonthLeaveDays, restoreShift, restoreLeaveDay } from '@/lib/scheduling/shift-data-service';
import { useUndoHistory, type UndoEntry, type DispatchChange } from '@/lib/scheduling/use-undo-history';
import { exportSchedulePdf } from '@/lib/scheduling/export-pdf';
import { exportScheduleExcel } from '@/lib/scheduling/export-excel';
import ShiftGridHeader from './shift-grid-header';
import ShiftGridDoctorRow from './shift-grid-doctor-row';
import ShiftSelectionPopup, { type SelectionPopupData } from './shift-selection-popup';
import ShiftGridWarnings from './shift-grid-warnings';
import ShiftGridLegend from './shift-grid-legend';
import SendScheduleDialog from './send-schedule-dialog';

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
  const [dispatchAssigning, setDispatchAssigning] = useState(false);
  const [equalizing, setEqualizing] = useState(false);
  const { generate: generateInWorker } = useSchedulingWorker();
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{
    doctorId: string;
    startDay: number;
    endDay: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStateRef = useRef<typeof dragState>(null);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupData | null>(null);
  const [altHoveredDay, setAltHoveredDay] = useState<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { toast } = useToast();
  const history = useUndoHistory();
  // Destructure stable callbacks for use in deps; canUndo/canRedo are derived in render
  const { push: historyPush, undo: historyUndo, redo: historyRedo, clear: historyClear, canUndo, canRedo } = history;

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

  // Detect days where generated shifts exceed the configured threshold (post-generation)
  const shiftOverstaffDays = useMemo(() => {
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
      if (counts.day > shiftsPerDay || counts.night > shiftsPerNight) {
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

  // Reactive rest violation warnings: recompute from current shifts using actual shift times
  const restViolationWarnings = useMemo(() => {
    if (!hasGeneratedForMonth) return [];
    const result: string[] = [];
    const monthShifts = shifts.filter(s => s.shift_date.startsWith(monthPrefix));
    const byDoctor = groupShiftsByDoctor(monthShifts);

    byDoctor.forEach((doctorShifts, doctorId) => {
      const doctor = doctors.find(d => d.id === doctorId);
      if (!doctor) return;
      const workShifts = doctorShifts.filter(s => s.shift_type === 'day' || s.shift_type === 'night' || s.shift_type === '24h');
      const sorted = [...workShifts].sort((a, b) =>
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
          result.push(`scheduling.engine.restViolation::${JSON.stringify({ name: doctor.name, date: curr.shift_date, hours: gapHours, required: minRest })}`);
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

    shiftOverstaffDays.forEach(({ dayCount, nightCount }, day) => {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      if (dayCount > shiftsPerDay) {
        result.push(`scheduling.engine.overstaffedDay::${JSON.stringify({ count: dayCount, required: shiftsPerDay, date: dateStr })}`);
      }
      if (nightCount > shiftsPerNight) {
        result.push(`scheduling.engine.overstaffedNight::${JSON.stringify({ count: nightCount, required: shiftsPerNight, date: dateStr })}`);
      }
    });

    return Array.from(new Set(result));
  }, [generationWarnings, normWarnings, restViolationWarnings, shiftShortfallDays, shiftOverstaffDays, currentMonth, currentYear, shiftsPerDay, shiftsPerNight]);

  // Sort doctors by team order first, then by display_order within each team
  const sortedDoctors = useMemo(() => {
    const teamOrderMap = new Map(teams.map((t) => [t.id, t.order ?? 0]));
    return [...doctors].sort((a, b) => {
      const teamA = a.team_id ? (teamOrderMap.get(a.team_id) ?? 999) : 999;
      const teamB = b.team_id ? (teamOrderMap.get(b.team_id) ?? 999) : 999;
      if (teamA !== teamB) return teamA - teamB;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
  }, [doctors, teams]);

  // --- Navigation ---
  const handlePreviousMonth = () => {
    if (currentMonth === 0) onMonthChange(11, currentYear - 1);
    else onMonthChange(currentMonth - 1, currentYear);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) onMonthChange(0, currentYear + 1);
    else onMonthChange(currentMonth + 1, currentYear);
  };

  // --- Schedule generation (shared logic) ---
  const runGeneration = async (workerFn: typeof generateInWorker) => {
    if (doctors.length === 0) {
      toast({ title: t('common.error'), description: t('scheduling.grid.toastNoDoctors'), variant: 'destructive' });
      return;
    }

    setGenerating(true);
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      const manualShifts = shifts.filter(s => s.is_manual && s.shift_date >= monthStart && s.shift_date <= monthEnd);
      onShiftsUpdate(manualShifts);

      // Fetch last few days of previous month from DB to seed rest constraints
      const prevMonthDate = new Date(currentYear, currentMonth, 0);
      const prevMonthEnd = formatDateString(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevMonthDate.getDate());
      const prevLookbackDay = Math.max(1, prevMonthDate.getDate() - 4);
      const prevMonthLookback = formatDateString(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevLookbackDay);
      const { data: prevShiftsData } = await supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', prevMonthLookback)
        .lte('shift_date', prevMonthEnd);
      const previousMonthShifts = (prevShiftsData ?? []) as Shift[];

      const result = await workerFn({
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
      const { data: savedShifts, error } = await supabase.from('shifts').upsert(
        Array.from(deduped.values()),
        { onConflict: 'doctor_id,shift_date' },
      ).select();
      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.grid.toastGenerateSuccess', { month: monthNames[currentMonth], year: currentYear }),
      });

      onShiftsUpdate([...manualShifts, ...(savedShifts ?? result.shifts)]);
    } catch (error) {
      console.error('Error generating schedule:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastGenerateError'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };
  const handleGenerateSchedule = () => runGeneration(generateInWorker);

  // --- Dispatch assignment ---
  const handleAssignDispatch = async () => {
    setDispatchAssigning(true);
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      const monthShifts = shifts.filter(s => s.shift_date >= monthStart && s.shift_date <= monthEnd);

      // Collect dates with manual dispatch assignments to preserve them
      const manualDispatchDates = { day: new Set<string>(), night: new Set<string>() };
      for (const s of monthShifts) {
        if (s.is_manual_dispatch && s.dispatch_type) {
          manualDispatchDates[s.dispatch_type].add(s.shift_date);
        }
      }

      const assignments = assignDispatch(monthShifts, doctors, currentMonth, currentYear, manualDispatchDates);

      // Clear existing non-manual dispatch for this month
      await supabase
        .from('shifts')
        .update({ dispatch_type: null })
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
        .eq('is_manual_dispatch', false);

      // Batch-apply new assignments: one query per dispatch_type
      const dayIds = assignments.filter(a => a.dispatchType === 'day').map(a => a.shiftId);
      const nightIds = assignments.filter(a => a.dispatchType === 'night').map(a => a.shiftId);
      await Promise.all([
        dayIds.length > 0 ? supabase.from('shifts').update({ dispatch_type: 'day' }).in('id', dayIds) : Promise.resolve(),
        nightIds.length > 0 ? supabase.from('shifts').update({ dispatch_type: 'night' }).in('id', nightIds) : Promise.resolve(),
      ]);

      // Update local state (preserve manual dispatches)
      const assignmentMap = new Map(assignments.map(a => [a.shiftId, a.dispatchType]));
      const updatedShifts = shifts.map(s => {
        if (s.shift_date >= monthStart && s.shift_date <= monthEnd && !s.is_manual_dispatch) {
          return { ...s, dispatch_type: assignmentMap.get(s.id) ?? null };
        }
        return s;
      });
      onShiftsUpdate(updatedShifts);

      toast({
        title: t('common.success'),
        description: t('scheduling.grid.dispatchAssignedSuccess', { month: monthNames[currentMonth], year: currentYear }),
      });
    } catch (error) {
      console.error('Error assigning dispatch:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.dispatchAssignError'), variant: 'destructive' });
    } finally {
      setDispatchAssigning(false);
    }
  };

  // --- Shift equalization ---
  const handleEqualizeShifts = async () => {
    setEqualizing(true);
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      const monthShifts = shifts.filter(s => s.shift_date >= monthStart && s.shift_date <= monthEnd);
      const result = equalizeShifts(monthShifts, {
        month: currentMonth,
        year: currentYear,
        doctors: doctors as any,
        teams,
        shiftsPerDay,
        shiftsPerNight,
        leaveDays,
        nationalHolidays,
      });

      if (result.swaps.length === 0) {
        toast({
          title: t('common.success'),
          description: t('scheduling.grid.equalizeNoChange'),
        });
        return;
      }

      // Batch-update Supabase: update doctor_id for each swapped shift
      const swapMap = new Map(result.swaps.map(sw => [sw.shiftId, sw.toDoctorId]));
      const shiftIds = result.swaps.map(sw => sw.shiftId);

      // Update in batches (Supabase doesn't support per-row updates in bulk,
      // so group by target doctor_id)
      const byTarget = new Map<string, string[]>();
      for (const sw of result.swaps) {
        if (!byTarget.has(sw.toDoctorId)) byTarget.set(sw.toDoctorId, []);
        byTarget.get(sw.toDoctorId)!.push(sw.shiftId);
      }
      await Promise.all(
        Array.from(byTarget.entries()).map(([doctorId, ids]) =>
          supabase.from('shifts').update({ doctor_id: doctorId }).in('id', ids)
        )
      );

      // Update local state
      const updatedShifts = shifts.map(s => {
        const newDoctorId = swapMap.get(s.id);
        if (newDoctorId) return { ...s, doctor_id: newDoctorId };
        return s;
      });
      onShiftsUpdate(updatedShifts);

      // Push to undo history
      const undoEntry: UndoEntry = {
        previousShifts: [],
        previousLeaveDays: [],
        createdShifts: [],
        createdLeaveDays: [],
        equalizeChanges: result.swaps.map(sw => ({
          shiftId: sw.shiftId,
          oldDoctorId: sw.fromDoctorId,
          newDoctorId: sw.toDoctorId,
        })),
      };
      historyPush(undoEntry);

      toast({
        title: t('common.success'),
        description: t('scheduling.grid.equalizeSuccess', { month: monthNames[currentMonth], year: currentYear }),
      });
    } catch (error) {
      console.error('Error equalizing shifts:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.equalizeError'), variant: 'destructive' });
    } finally {
      setEqualizing(false);
    }
  };

  // --- Day/cell query helpers ---
  const getShiftForDoctorAndDay = (doctorId: string, day: number): Shift | undefined => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  };

  const getShiftsForDoctorAndDay = (doctorId: string, day: number): Shift[] => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return shifts.filter(s => s.doctor_id === doctorId && s.shift_date === dateStr);
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

  // --- Rest violations (using actual shift start/end times) ---
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

  const bodyScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = bodyScrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const handleScroll = () => {
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = viewport.scrollLeft;
      }
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCellMouseDown = (doctorId: string, day: number, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectionPopup(null);
    setIsDragging(true);
    isDraggingRef.current = true;
    const ds = { doctorId, startDay: day, endDay: day };
    setDragState(ds);
    dragStateRef.current = ds;
  };

  const handleCellMouseEnter = (doctorId: string, day: number) => {
    if (!isDragging || !dragState) return;
    if (dragState.doctorId !== doctorId) return;
    setDragState(prev => {
      const next = prev ? { ...prev, endDay: day } : null;
      dragStateRef.current = next;
      return next;
    });
  };

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !dragStateRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const ds = dragStateRef.current;
    const min = Math.min(ds.startDay, ds.endDay);
    const max = Math.max(ds.startDay, ds.endDay);
    const selectedDays = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    setSelectionPopup({ doctorId: ds.doctorId, days: selectedDays, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionPopup && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSelectionPopup(null);
        setDragState(null);
        dragStateRef.current = null;
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

  const selectionDispatchTypes = useMemo(() => {
    const types = new Set<'day' | 'night'>();
    if (!selectionPopup) return types;
    const { doctorId, days: selectedDays } = selectionPopup;
    for (const day of selectedDays) {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      const shift = shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr && s.dispatch_type);
      if (shift?.dispatch_type) types.add(shift.dispatch_type as 'day' | 'night');
    }
    return types;
  }, [selectionPopup, shifts, currentYear, currentMonth]);

  const selectionShiftTypes = useMemo(() => {
    if (!selectionPopup) return new Set<string>();
    const { doctorId, days: selectedDays } = selectionPopup;
    const types = new Set<string>();
    for (const day of selectedDays) {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      const shift = shifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
      if (shift) types.add(shift.shift_type);
    }
    return types;
  }, [selectionPopup, shifts, currentYear, currentMonth]);

  const selectionHasBridgeCandidates = useMemo(() => {
    if (!selectionPopup) return false;
    const { days: selectedDays } = selectionPopup;
    return selectedDays.some(day => isNonWorkingDay(day));
  }, [selectionPopup, currentYear, currentMonth, nationalHolidays]);

  // --- Batch actions ---
  const handleBatchAction = async (action: 'day' | 'night' | '24h' | 'leave' | 'bridge') => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;
    setSelectionPopup(null);
    setDragState(null);
    dragStateRef.current = null;

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];
      const snapshotShifts: Shift[] = [];
      const snapshotLeaves: LeaveDay[] = [];
      const createdShifts: Shift[] = [];
      const createdLeaves: LeaveDay[] = [];

      for (const day of selectedDays) {
        const dateStr = formatDateString(currentYear, currentMonth, day);

        if (action === 'bridge' && !isNonWorkingDay(day)) continue;

        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        if (existingShift) {
          if (action !== 'leave' && action !== 'bridge' && action === existingShift.shift_type) continue;
          snapshotShifts.push(existingShift);
          await deleteRecord(supabase, 'shifts', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }

        if (existingLeave) {
          const existingType = existingLeave.leave_type || 'regular';
          const targetType = action === 'bridge' ? 'bridge' : isNonWorkingDay(day) ? 'bridge' : 'regular';
          if ((action === 'leave' || action === 'bridge') && existingType === targetType) continue;
          snapshotLeaves.push(existingLeave);
          await deleteRecord(supabase, 'leave_days', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);
        }

        if (action === 'leave' || action === 'bridge') {
          const leaveType = action === 'bridge' ? 'bridge' : isNonWorkingDay(day) ? 'bridge' : 'regular';
          const data = await createLeaveDay(supabase, doctorId, dateStr, leaveType);
          createdLeaves.push(data);
          updatedLeaveDays = [...updatedLeaveDays, data];
        } else {
          const data = await upsertShift(supabase, doctorId, dateStr, action);
          createdShifts.push(data);
          updatedShifts = [...updatedShifts, data];
        }
      }

      historyPush({ previousShifts: snapshotShifts, previousLeaveDays: snapshotLeaves, createdShifts, createdLeaveDays: createdLeaves });
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
    dragStateRef.current = null;

    try {
      let updatedShifts = [...shifts];
      let updatedLeaveDays = [...leaveDays];
      const snapshotShifts: Shift[] = [];
      const snapshotLeaves: LeaveDay[] = [];

      for (const day of selectedDays) {
        const dateStr = formatDateString(currentYear, currentMonth, day);
        const existingShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        const existingLeave = updatedLeaveDays.find(l => l.doctor_id === doctorId && l.leave_date === dateStr);

        if (existingShift) {
          snapshotShifts.push(existingShift);
          await deleteRecord(supabase, 'shifts', existingShift.id);
          updatedShifts = updatedShifts.filter(s => s.id !== existingShift.id);
        }
        if (existingLeave) {
          snapshotLeaves.push(existingLeave);
          await deleteRecord(supabase, 'leave_days', existingLeave.id);
          updatedLeaveDays = updatedLeaveDays.filter(l => l.id !== existingLeave.id);
        }
      }

      historyPush({ previousShifts: snapshotShifts, previousLeaveDays: snapshotLeaves, createdShifts: [], createdLeaveDays: [] });
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

  const handleDispatchAction = async (dispatchType: 'day' | 'night') => {
    if (!selectionPopup) return;
    const { doctorId, days: selectedDays } = selectionPopup;
    setSelectionPopup(null);
    setDragState(null);
    dragStateRef.current = null;

    try {
      let updatedShifts = [...shifts];
      const dispatchChanges: DispatchChange[] = [];

      for (const day of selectedDays) {
        const dateStr = formatDateString(currentYear, currentMonth, day);
        const targetShift = updatedShifts.find(s => s.doctor_id === doctorId && s.shift_date === dateStr);
        if (!targetShift) continue;

        // Remove existing dispatch of the same type on this day from any other doctor
        const existingDispatch = updatedShifts.find(
          s => s.shift_date === dateStr && s.dispatch_type === dispatchType && s.id !== targetShift.id
        );
        if (existingDispatch) {
          dispatchChanges.push({
            shiftId: existingDispatch.id,
            previousDispatchType: existingDispatch.dispatch_type as 'day' | 'night',
            newDispatchType: null,
            previousIsManualDispatch: !!existingDispatch.is_manual_dispatch,
            newIsManualDispatch: false,
          });
          await supabase.from('shifts').update({ dispatch_type: null, is_manual_dispatch: false }).eq('id', existingDispatch.id);
          updatedShifts = updatedShifts.map(s =>
            s.id === existingDispatch.id ? { ...s, dispatch_type: null, is_manual_dispatch: false } : s
          );
        }

        // Toggle dispatch on the target shift: remove if same type, set otherwise
        const isToggleOff = targetShift.dispatch_type === dispatchType;
        const newType = isToggleOff ? null : dispatchType;
        const isManualDispatch = !isToggleOff;
        dispatchChanges.push({
          shiftId: targetShift.id,
          previousDispatchType: (targetShift.dispatch_type as 'day' | 'night' | null) ?? null,
          newDispatchType: newType,
          previousIsManualDispatch: !!targetShift.is_manual_dispatch,
          newIsManualDispatch: isManualDispatch,
        });
        await supabase.from('shifts').update({ dispatch_type: newType, is_manual_dispatch: isManualDispatch }).eq('id', targetShift.id);
        updatedShifts = updatedShifts.map(s =>
          s.id === targetShift.id ? { ...s, dispatch_type: newType, is_manual_dispatch: isManualDispatch } : s
        );
      }

      historyPush({ previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [], dispatchChanges });
      onShiftsUpdate(updatedShifts);
      toast({
        title: t('common.success'),
        description: t('scheduling.grid.manualDispatchApplied'),
      });
    } catch (error) {
      console.error('Error assigning dispatch manually:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.dispatchAssignError'), variant: 'destructive' });
    }
  };

  const handleClearMonth = async () => {
    const { start: monthStart, end: monthEnd } = getMonthBoundary(currentYear, currentMonth, daysInMonth);

    try {
      await deleteMonthShifts(supabase, monthStart, monthEnd);

      onShiftsUpdate([]);
      historyClear();

      toast({
        title: t('scheduling.grid.clearedMonthTitle'),
        description: t('scheduling.grid.clearedMonthDesc', { month: monthNames[currentMonth], year: currentYear }),
      });
    } catch (error) {
      console.error('Error clearing month:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.toastClearMonthError'), variant: 'destructive' });
    }
  };

  // --- Undo / Redo ---
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  const leaveDaysRef = useRef(leaveDays);
  leaveDaysRef.current = leaveDays;

  const handleUndo = useCallback(async () => {
    const entry = historyUndo();
    if (!entry) return;

    try {
      // Delete what the action created
      await Promise.all([
        ...entry.createdShifts.map(s => deleteRecord(supabase, 'shifts', s.id)),
        ...entry.createdLeaveDays.map(l => deleteRecord(supabase, 'leave_days', l.id)),
      ]);

      // Restore what existed before
      const restoredShifts = await Promise.all(entry.previousShifts.map(s => restoreShift(supabase, s)));
      const restoredLeaves = await Promise.all(entry.previousLeaveDays.map(l => restoreLeaveDay(supabase, l)));

      // Reverse dispatch changes (set each shift back to its previous dispatch_type)
      let currentShifts = shiftsRef.current;
      if (entry.dispatchChanges?.length) {
        await Promise.all(
          entry.dispatchChanges.map(dc =>
            supabase.from('shifts').update({ dispatch_type: dc.previousDispatchType, is_manual_dispatch: dc.previousIsManualDispatch ?? false }).eq('id', dc.shiftId)
          )
        );
        const dcMap = new Map(entry.dispatchChanges.map(dc => [dc.shiftId, dc]));
        currentShifts = currentShifts.map(s => {
          const dc = dcMap.get(s.id);
          return dc ? { ...s, dispatch_type: dc.previousDispatchType ?? null, is_manual_dispatch: dc.previousIsManualDispatch ?? false } : s;
        });
      }

      // Reverse equalize changes (set each shift back to its old doctor_id)
      if (entry.equalizeChanges?.length) {
        const byOldDoctor = new Map<string, string[]>();
        for (const ec of entry.equalizeChanges) {
          if (!byOldDoctor.has(ec.oldDoctorId)) byOldDoctor.set(ec.oldDoctorId, []);
          byOldDoctor.get(ec.oldDoctorId)!.push(ec.shiftId);
        }
        await Promise.all(
          Array.from(byOldDoctor.entries()).map(([doctorId, ids]) =>
            supabase.from('shifts').update({ doctor_id: doctorId }).in('id', ids)
          )
        );
        const ecMap = new Map(entry.equalizeChanges.map(ec => [ec.shiftId, ec.oldDoctorId]));
        currentShifts = currentShifts.map(s => ecMap.has(s.id) ? { ...s, doctor_id: ecMap.get(s.id)! } : s);
      }

      // Update local state
      const createdShiftSet = new Set(entry.createdShifts.map(s => s.id));
      const createdLeaveSet = new Set(entry.createdLeaveDays.map(l => l.id));
      onShiftsUpdate([...currentShifts.filter(s => !createdShiftSet.has(s.id)), ...restoredShifts]);
      onLeaveDaysUpdate([...leaveDaysRef.current.filter(l => !createdLeaveSet.has(l.id)), ...restoredLeaves]);

      // Mutate entry in-place so redo picks up the new DB IDs
      entry.previousShifts = restoredShifts;
      entry.previousLeaveDays = restoredLeaves;

      toast({ title: t('scheduling.grid.undone'), description: t('scheduling.grid.undoneDesc') });
    } catch (error) {
      console.error('Error undoing action:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.undoError'), variant: 'destructive' });
    }
  }, [historyUndo, supabase, onShiftsUpdate, onLeaveDaysUpdate, toast, t]);

  const handleRedo = useCallback(async () => {
    const entry = historyRedo();
    if (!entry) return;

    try {
      // Delete what undo restored
      await Promise.all([
        ...entry.previousShifts.map(s => deleteRecord(supabase, 'shifts', s.id)),
        ...entry.previousLeaveDays.map(l => deleteRecord(supabase, 'leave_days', l.id)),
      ]);

      // Re-create what the original action created
      const reCreatedShifts = await Promise.all(entry.createdShifts.map(s => restoreShift(supabase, s)));
      const reCreatedLeaves = await Promise.all(entry.createdLeaveDays.map(l => restoreLeaveDay(supabase, l)));

      // Re-apply dispatch changes (set each shift to its new dispatch_type)
      let currentShifts = shiftsRef.current;
      if (entry.dispatchChanges?.length) {
        await Promise.all(
          entry.dispatchChanges.map(dc =>
            supabase.from('shifts').update({ dispatch_type: dc.newDispatchType, is_manual_dispatch: dc.newIsManualDispatch ?? false }).eq('id', dc.shiftId)
          )
        );
        const dcMap = new Map(entry.dispatchChanges.map(dc => [dc.shiftId, dc]));
        currentShifts = currentShifts.map(s => {
          const dc = dcMap.get(s.id);
          return dc ? { ...s, dispatch_type: dc.newDispatchType ?? null, is_manual_dispatch: dc.newIsManualDispatch ?? false } : s;
        });
      }

      // Re-apply equalize changes (set each shift to its new doctor_id)
      if (entry.equalizeChanges?.length) {
        const byNewDoctor = new Map<string, string[]>();
        for (const ec of entry.equalizeChanges) {
          if (!byNewDoctor.has(ec.newDoctorId)) byNewDoctor.set(ec.newDoctorId, []);
          byNewDoctor.get(ec.newDoctorId)!.push(ec.shiftId);
        }
        await Promise.all(
          Array.from(byNewDoctor.entries()).map(([doctorId, ids]) =>
            supabase.from('shifts').update({ doctor_id: doctorId }).in('id', ids)
          )
        );
        const ecMap = new Map(entry.equalizeChanges.map(ec => [ec.shiftId, ec.newDoctorId]));
        currentShifts = currentShifts.map(s => ecMap.has(s.id) ? { ...s, doctor_id: ecMap.get(s.id)! } : s);
      }

      // Update local state
      const prevShiftSet = new Set(entry.previousShifts.map(s => s.id));
      const prevLeaveSet = new Set(entry.previousLeaveDays.map(l => l.id));
      onShiftsUpdate([...currentShifts.filter(s => !prevShiftSet.has(s.id)), ...reCreatedShifts]);
      onLeaveDaysUpdate([...leaveDaysRef.current.filter(l => !prevLeaveSet.has(l.id)), ...reCreatedLeaves]);

      // Mutate entry in-place so next undo picks up the new DB IDs
      entry.createdShifts = reCreatedShifts;
      entry.createdLeaveDays = reCreatedLeaves;

      toast({ title: t('scheduling.grid.redone'), description: t('scheduling.grid.redoneDesc') });
    } catch (error) {
      console.error('Error redoing action:', error);
      toast({ title: t('common.error'), description: t('scheduling.grid.redoError'), variant: 'destructive' });
    }
  }, [historyRedo, supabase, onShiftsUpdate, onLeaveDaysUpdate, toast, t]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Clear history on month change
  useEffect(() => {
    historyClear();
  }, [currentMonth, currentYear, historyClear]);

  // Clear ALT-hover highlight when ALT key is released
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHoveredDay(null);
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []);

  // --- Cell letter extraction ---
  const extractCellLetter = (label: string, fallback: string): string => {
    return label.match(/\((.+?)\)/)?.[1] || fallback;
  };

  const dayShiftLetter = extractCellLetter(t('scheduling.grid.dayShiftLabel'), 'Z');
  const nightShiftLetter = extractCellLetter(t('scheduling.grid.nightShiftLabel'), 'N');
  const leaveLetter = extractCellLetter(t('scheduling.grid.leaveLabel'), 'C');
  const shift24hLetter = extractCellLetter(t('scheduling.grid.shift24hLabel'), 'DN');

  const handleExportPdf = () => {
    exportSchedulePdf({
      doctors,
      teams,
      shifts,
      leaveDays,
      nationalHolidays,
      currentMonth,
      currentYear,
      monthName: monthNames[currentMonth],
      dayNames: tArray('daysShort'),
      labels: {
        dayShiftLetter,
        nightShiftLetter,
        leaveLetter,
        shift24hLetter,
        doctorColumn: t('scheduling.grid.doctorColumn'),
        title: t('scheduling.grid.title'),
      },
    });
  };

  const handleExportExcel = () => {
    exportScheduleExcel({
      doctors,
      teams,
      shifts,
      leaveDays,
      nationalHolidays,
      currentMonth,
      currentYear,
      monthName: monthNames[currentMonth],
      dayNames: tArray('daysShort'),
      labels: {
        dayShiftLetter,
        nightShiftLetter,
        leaveLetter,
        shift24hLetter,
        doctorColumn: t('scheduling.grid.doctorColumn'),
        title: t('scheduling.grid.title'),
      },
    });
  };

  // --- Send schedule to doctors ---
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendingSchedule, setSendingSchedule] = useState(false);

  const handleSendSchedule = async () => {
    setSendingSchedule(true);
    try {
      const res = await fetch('/api/send-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, year: currentYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: t('common.success'),
        description: t('scheduling.grid.scheduleSentSuccess', { count: String(data.sent) }),
      });
    } catch (error) {
      toast({ title: t('common.error'), description: t('scheduling.grid.scheduleSentError'), variant: 'destructive' });
    } finally {
      setSendingSchedule(false);
      setSendDialogOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <ShiftGridHeader
          currentMonth={currentMonth}
          currentYear={currentYear}
          currentLeaveDaysCount={currentLeaveDaysCount}
          totalBridgeDaysCount={totalBridgeDaysCount}
          generating={generating}
          dispatchAssigning={dispatchAssigning}
          equalizing={equalizing}
          hasGeneratedSchedule={hasGeneratedForMonth}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onGenerate={handleGenerateSchedule}
          onClearMonth={handleClearMonth}
          onAssignDispatch={handleAssignDispatch}
          onEqualizeShifts={handleEqualizeShifts}
          onExportPdf={handleExportPdf}
          onExportExcel={handleExportExcel}
          onSendSchedule={() => setSendDialogOpen(true)}
          sendingSchedule={sendingSchedule}
          doctorsWithEmail={doctors.filter(d => d.email?.trim()).length}
          canUndo={canUndo}
          onUndo={handleUndo}
          canRedo={canRedo}
          onRedo={handleRedo}
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
          {/* Sticky header row */}
          <div className="sticky top-0 z-20 bg-background overflow-hidden" ref={headerScrollRef}>
            <div className="min-w-max">
              <div className="flex border-b">
                <div className="w-32 min-w-32 md:w-48 md:min-w-48 p-2 font-semibold border-r bg-muted">
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
                    onMouseMove={(e) => { if (e.altKey) setAltHoveredDay(day); else if (altHoveredDay === day) setAltHoveredDay(null); }}
                    onMouseLeave={() => { if (altHoveredDay === day) setAltHoveredDay(null); }}
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

          {/* Scrollable body */}
          <ScrollArea className="w-full" ref={bodyScrollRef}>
            <div className="min-w-max">
              {/* Doctor rows */}
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
                  isCellSelected={(day) => isCellSelected(doctor.id, day)}
                  hasRestViolation={(day) => hasRestViolation(doctor.id, day)}
                  isBridgeDay={(day) => isBridgeDay(doctor.id, day)}
                  isNonWorkingDay={isNonWorkingDay}
                  isUnderstaffedDay={isUnderstaffedDay}
                  isNationalHoliday={isNationalHoliday}
                  isWeekend={isWeekend}
                  onCellMouseDown={(day, e) => handleCellMouseDown(doctor.id, day, e)}
                  onCellMouseEnter={(day) => handleCellMouseEnter(doctor.id, day)}
                  onCellMouseMove={(day, e) => { if (e.altKey) setAltHoveredDay(day); else if (altHoveredDay === day) setAltHoveredDay(null); }}
                  hasGenerated={hasGeneratedForMonth}
                  altHighlight={altHoveredDay !== null && !getShiftForDoctorAndDay(doctor.id, altHoveredDay) && !isLeaveDay(doctor.id, altHoveredDay) && !isBridgeDay(doctor.id, altHoveredDay)}
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
              activeDispatchTypes={selectionDispatchTypes}
              shiftTypes={selectionShiftTypes}
              onBatchAction={handleBatchAction}
              onDispatchAction={handleDispatchAction}
              onBatchClear={handleBatchClear}
            />
          )}

          <ShiftGridWarnings warnings={warnings} understaffedDays={understaffedDays} />
          <ShiftGridLegend dayShiftLetter={dayShiftLetter} nightShiftLetter={nightShiftLetter} leaveLetter={leaveLetter} shift24hLetter={shift24hLetter} />
          {process.env.NODE_ENV === 'development' && restViolations.size > 0 && (
            <div className="text-xs text-muted-foreground mt-2">
              Violations: {restViolations.size}
            </div>
          )}
        </CardContent>
      </Card>

      <SendScheduleDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        doctors={doctors}
        monthName={monthNames[currentMonth]}
        year={currentYear}
        sending={sendingSchedule}
        onSend={handleSendSchedule}
      />
    </div>
  );
}
