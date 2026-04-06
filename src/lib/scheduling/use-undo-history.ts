'use client';

import { useRef, useState, useCallback } from 'react';
import type { Shift, LeaveDay } from '@/types/scheduling';

export type DispatchChange = {
  shiftId: string;
  previousDispatchType: 'day' | 'night' | null;
  newDispatchType: 'day' | 'night' | null;
};

export type EqualizeChange = {
  shiftId: string;
  oldDoctorId: string;
  newDoctorId: string;
};

export type UndoEntry = {
  /** Records that existed before the action (to restore on undo) */
  previousShifts: Shift[];
  previousLeaveDays: LeaveDay[];
  /** Full records created by the action (to delete on undo, re-create on redo) */
  createdShifts: Shift[];
  createdLeaveDays: LeaveDay[];
  /** In-place dispatch_type changes (for manual dispatch assignment) */
  dispatchChanges?: DispatchChange[];
  /** In-place doctor_id swaps (for shift equalization) */
  equalizeChanges?: EqualizeChange[];
};

/**
 * Classic index-based undo/redo history.
 * - `push` appends after current index, truncating any redo entries.
 * - `undo` moves the index back and returns the entry to reverse.
 * - `redo` moves the index forward and returns the entry to re-apply.
 */
export function useUndoHistory(maxSize = 20) {
  const entriesRef = useRef<UndoEntry[]>([]);
  // index points to the last applied entry (-1 = nothing applied)
  const indexRef = useRef(-1);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const canUndo = indexRef.current >= 0;
  const canRedo = indexRef.current < entriesRef.current.length - 1;

  /** Record a new action. Clears any redo entries ahead. */
  const push = useCallback((entry: UndoEntry) => {
    const newIndex = indexRef.current + 1;
    // Truncate anything after current position (discard redo history)
    entriesRef.current = [...entriesRef.current.slice(0, newIndex), entry].slice(-maxSize);
    indexRef.current = entriesRef.current.length - 1;
    bump();
  }, [maxSize, bump]);

  /** Move back one step. Returns the entry to reverse, or undefined. */
  const undo = useCallback((): UndoEntry | undefined => {
    if (indexRef.current < 0) return undefined;
    const entry = entriesRef.current[indexRef.current];
    indexRef.current--;
    bump();
    return entry;
  }, [bump]);

  /** Move forward one step. Returns the entry to re-apply, or undefined. */
  const redo = useCallback((): UndoEntry | undefined => {
    if (indexRef.current >= entriesRef.current.length - 1) return undefined;
    indexRef.current++;
    const entry = entriesRef.current[indexRef.current];
    bump();
    return entry;
  }, [bump]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    indexRef.current = -1;
    bump();
  }, [bump]);

  return { push, undo, redo, clear, canUndo, canRedo };
}
