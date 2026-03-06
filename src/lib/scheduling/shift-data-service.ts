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
  shiftType: 'day' | 'night',
): Promise<Shift> {
  const { data, error } = await supabase
    .from('shifts')
    .upsert(
      {
        doctor_id: doctorId,
        shift_date: dateStr,
        shift_type: shiftType,
        start_time: shiftType === 'day' ? '08:00' : '20:00',
        end_time: shiftType === 'day' ? '20:00' : '08:00',
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
): Promise<LeaveDay> {
  const { data, error } = await supabase
    .from('leave_days')
    .insert({ doctor_id: doctorId, leave_date: dateStr })
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
