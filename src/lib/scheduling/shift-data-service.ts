/**
 * Thin wrappers around Supabase CRUD operations for shifts and leave days.
 * Centralizes repeated DB patterns from shift-grid-calendar.tsx.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Shift, LeaveDay } from '@/types/scheduling';

export async function upsertShift(
  supabase: SupabaseClient,
  doctorId: string,
  dateStr: string,
  shiftType: 'day' | 'night' | '24h',
): Promise<Shift> {
  const startTime = shiftType === 'night' ? '20:00' : '08:00';
  const endTime = shiftType === 'day' ? '20:00' : '08:00'; // night and 24h both end at 08:00
  const { data, error } = await supabase
    .from('shifts')
    .upsert(
      {
        doctor_id: doctorId,
        shift_date: dateStr,
        shift_type: shiftType,
        start_time: startTime,
        end_time: endTime,
        is_manual: true,
      },
      { onConflict: 'doctor_id,shift_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createLeaveDay(
  supabase: SupabaseClient,
  doctorId: string,
  dateStr: string,
  leaveType: 'regular' | 'bridge' = 'regular',
): Promise<LeaveDay> {
  const { data, error } = await supabase
    .from('leave_days')
    .insert({ doctor_id: doctorId, leave_date: dateStr, leave_type: leaveType })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecord(
  supabase: SupabaseClient,
  table: 'shifts' | 'leave_days',
  id: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function deleteMonthShifts(
  supabase: SupabaseClient,
  monthStart: string,
  monthEnd: string,
): Promise<void> {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .gte('shift_date', monthStart)
    .lte('shift_date', monthEnd);
  if (error) throw error;
}

export async function deleteMonthLeaveDays(
  supabase: SupabaseClient,
  monthStart: string,
  monthEnd: string,
): Promise<void> {
  const { error } = await supabase
    .from('leave_days')
    .delete()
    .gte('leave_date', monthStart)
    .lte('leave_date', monthEnd);
  if (error) throw error;
}

export async function restoreShift(
  supabase: SupabaseClient,
  shift: Shift,
): Promise<Shift> {
  const { data, error } = await supabase
    .from('shifts')
    .upsert(
      {
        doctor_id: shift.doctor_id,
        shift_date: shift.shift_date,
        shift_type: shift.shift_type,
        start_time: shift.start_time,
        end_time: shift.end_time,
        is_manual: shift.is_manual ?? true,
        dispatch_type: shift.dispatch_type ?? null,
      },
      { onConflict: 'doctor_id,shift_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function restoreLeaveDay(
  supabase: SupabaseClient,
  leave: LeaveDay,
): Promise<LeaveDay> {
  const { data, error } = await supabase
    .from('leave_days')
    .upsert(
      {
        doctor_id: leave.doctor_id,
        leave_date: leave.leave_date,
        leave_type: leave.leave_type ?? 'regular',
      },
      { onConflict: 'doctor_id,leave_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
