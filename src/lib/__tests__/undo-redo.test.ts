import { describe, it, expect, beforeEach } from 'vitest';
import type { Shift, LeaveDay } from '@/types/scheduling';

// Mirror of UndoEntry from use-undo-history.ts (can't import the module
// directly as it uses React hooks / 'use client').
type UndoEntry = {
  previousShifts: Shift[];
  previousLeaveDays: LeaveDay[];
  createdShifts: Shift[];
  createdLeaveDays: LeaveDay[];
};

// ---------------------------------------------------------------------------
// We replicate the *pure logic* of useUndoHistory in a plain class and verify
// push/undo/redo behaviour — the React wrapper is trivial (refs + bump).
// ---------------------------------------------------------------------------

class UndoHistory {
  entries: UndoEntry[] = [];
  index = -1; // points to last applied entry
  maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  get canUndo() { return this.index >= 0; }
  get canRedo() { return this.index < this.entries.length - 1; }

  push(entry: UndoEntry) {
    const newIndex = this.index + 1;
    this.entries = [...this.entries.slice(0, newIndex), entry].slice(-this.maxSize);
    this.index = this.entries.length - 1;
  }

  undo(): UndoEntry | undefined {
    if (this.index < 0) return undefined;
    const entry = this.entries[this.index];
    this.index--;
    return entry;
  }

  redo(): UndoEntry | undefined {
    if (this.index >= this.entries.length - 1) return undefined;
    this.index++;
    return this.entries[this.index];
  }

  clear() {
    this.entries = [];
    this.index = -1;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idSeq = 0;
function uid() { return `id-${++idSeq}`; }

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: uid(),
    doctor_id: 'doc-1',
    shift_date: '2026-03-10',
    shift_type: 'day',
    start_time: '08:00',
    end_time: '20:00',
    is_manual: true,
    ...overrides,
  };
}

function makeLeave(overrides: Partial<LeaveDay> = {}): LeaveDay {
  return {
    id: uid(),
    doctor_id: 'doc-1',
    leave_date: '2026-03-12',
    leave_type: 'regular',
    ...overrides,
  };
}

// Simulates what the component does: keeps a local shifts/leaveDays array,
// applies undo/redo using the same logic as shift-grid-calendar.tsx.
class GridSimulator {
  history = new UndoHistory();
  shifts: Shift[] = [];
  leaveDays: LeaveDay[] = [];

  // Simulates handleBatchAction: add a shift to an empty cell
  addShift(shift: Shift) {
    this.shifts.push(shift);
    this.history.push({
      previousShifts: [],
      previousLeaveDays: [],
      createdShifts: [shift],
      createdLeaveDays: [],
    });
  }

  // Simulates handleBatchAction: replace an existing shift with a new one
  replaceShift(oldShift: Shift, newShift: Shift) {
    this.shifts = this.shifts.filter(s => s.id !== oldShift.id);
    this.shifts.push(newShift);
    this.history.push({
      previousShifts: [oldShift],
      previousLeaveDays: [],
      createdShifts: [newShift],
      createdLeaveDays: [],
    });
  }

  // Simulates handleBatchClear: remove a shift
  clearShift(shift: Shift) {
    this.shifts = this.shifts.filter(s => s.id !== shift.id);
    this.history.push({
      previousShifts: [shift],
      previousLeaveDays: [],
      createdShifts: [],
      createdLeaveDays: [],
    });
  }

  // Simulates handleBatchAction with leave
  addLeave(leave: LeaveDay) {
    this.leaveDays.push(leave);
    this.history.push({
      previousShifts: [],
      previousLeaveDays: [],
      createdShifts: [],
      createdLeaveDays: [leave],
    });
  }

  // Simulates handleUndo — mirrors shift-grid-calendar.tsx logic exactly
  undo(): boolean {
    const entry = this.history.undo();
    if (!entry) return false;

    // "Delete" created records from local state
    const createdShiftIds = new Set(entry.createdShifts.map(s => s.id));
    const createdLeaveIds = new Set(entry.createdLeaveDays.map(l => l.id));
    this.shifts = this.shifts.filter(s => !createdShiftIds.has(s.id));
    this.leaveDays = this.leaveDays.filter(l => !createdLeaveIds.has(l.id));

    // "Restore" previous records — in real code, restoreShift returns a new
    // record with a potentially different ID. Simulate that.
    const restoredShifts = entry.previousShifts.map(s => ({ ...s, id: uid() }));
    const restoredLeaves = entry.previousLeaveDays.map(l => ({ ...l, id: uid() }));
    this.shifts.push(...restoredShifts);
    this.leaveDays.push(...restoredLeaves);

    // Mutate entry in-place so redo picks up new IDs (the fix!)
    entry.previousShifts = restoredShifts;
    entry.previousLeaveDays = restoredLeaves;

    return true;
  }

  // Simulates handleRedo — mirrors shift-grid-calendar.tsx logic exactly
  redo(): boolean {
    const entry = this.history.redo();
    if (!entry) return false;

    // "Delete" what undo restored
    const prevShiftIds = new Set(entry.previousShifts.map(s => s.id));
    const prevLeaveIds = new Set(entry.previousLeaveDays.map(l => l.id));
    this.shifts = this.shifts.filter(s => !prevShiftIds.has(s.id));
    this.leaveDays = this.leaveDays.filter(l => !prevLeaveIds.has(l.id));

    // "Re-create" what the original action created
    const reCreatedShifts = entry.createdShifts.map(s => ({ ...s, id: uid() }));
    const reCreatedLeaves = entry.createdLeaveDays.map(l => ({ ...l, id: uid() }));
    this.shifts.push(...reCreatedShifts);
    this.leaveDays.push(...reCreatedLeaves);

    // Mutate entry in-place so next undo picks up new IDs
    entry.createdShifts = reCreatedShifts;
    entry.createdLeaveDays = reCreatedLeaves;

    return true;
  }

  /** Shift count for a given doctor+date */
  shiftsFor(doctorId: string, date: string) {
    return this.shifts.filter(s => s.doctor_id === doctorId && s.shift_date === date);
  }

  leavesFor(doctorId: string, date: string) {
    return this.leaveDays.filter(l => l.doctor_id === doctorId && l.leave_date === date);
  }
}

// ---------------------------------------------------------------------------
// UndoHistory unit tests (pure logic)
// ---------------------------------------------------------------------------

describe('UndoHistory', () => {
  let h: UndoHistory;

  beforeEach(() => {
    idSeq = 0;
    h = new UndoHistory();
  });

  it('starts empty', () => {
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  it('push then undo then redo', () => {
    const entry: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };
    h.push(entry);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    const undone = h.undo();
    expect(undone).toBe(entry); // same reference
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    const redone = h.redo();
    expect(redone).toBe(entry);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it('new push after undo discards redo entries', () => {
    const e1: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };
    const e2: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };
    const e3: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };

    h.push(e1);
    h.push(e2);
    h.undo(); // index 1→0, can redo
    expect(h.canRedo).toBe(true);

    h.push(e3); // should discard e2 from redo
    expect(h.canRedo).toBe(false);
    expect(h.entries).toHaveLength(2); // e1, e3
    expect(h.undo()).toBe(e3);
    expect(h.undo()).toBe(e1);
  });

  it('undo returns entries in reverse order', () => {
    const e1: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [makeShift({ id: 'a' })], createdLeaveDays: [] };
    const e2: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [makeShift({ id: 'b' })], createdLeaveDays: [] };

    h.push(e1);
    h.push(e2);

    expect(h.undo()).toBe(e2);
    expect(h.undo()).toBe(e1);
    expect(h.undo()).toBeUndefined();
  });

  it('multiple undo then redo replays in order', () => {
    const e1: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };
    const e2: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };
    const e3: UndoEntry = { previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] };

    h.push(e1);
    h.push(e2);
    h.push(e3);

    h.undo(); // e3
    h.undo(); // e2
    expect(h.redo()).toBe(e2);
    expect(h.redo()).toBe(e3);
    expect(h.redo()).toBeUndefined();
  });

  it('clear resets everything', () => {
    h.push({ previousShifts: [], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] });
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.entries).toHaveLength(0);
  });

  it('respects maxSize', () => {
    const small = new UndoHistory(3);
    for (let i = 0; i < 5; i++) {
      small.push({ previousShifts: [], previousLeaveDays: [], createdShifts: [makeShift({ id: `s${i}` })], createdLeaveDays: [] });
    }
    expect(small.entries).toHaveLength(3);
    // oldest entries (s0, s1) were evicted; s2, s3, s4 remain
    expect(small.entries[0].createdShifts[0].id).toBe('s2');
  });

  it('undo returns a mutable reference to the entry', () => {
    const shift = makeShift();
    h.push({ previousShifts: [shift], previousLeaveDays: [], createdShifts: [], createdLeaveDays: [] });

    const entry = h.undo()!;
    const newShift = makeShift({ id: 'new-id' });
    entry.previousShifts = [newShift]; // mutate in-place

    const redone = h.redo()!;
    expect(redone.previousShifts[0].id).toBe('new-id'); // mutation visible
  });
});

// ---------------------------------------------------------------------------
// GridSimulator integration tests (undo/redo with state management)
// ---------------------------------------------------------------------------

describe('Grid undo/redo integration', () => {
  let grid: GridSimulator;

  beforeEach(() => {
    idSeq = 0;
    grid = new GridSimulator();
  });

  it('undo after adding a shift removes it', () => {
    const shift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    grid.addShift(shift);
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);

    grid.undo();
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(0);
  });

  it('redo after undo re-adds the shift', () => {
    const shift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    grid.addShift(shift);
    grid.undo();
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(0);

    grid.redo();
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);
    expect(grid.shiftsFor('doc-1', '2026-03-10')[0].shift_type).toBe('day');
  });

  it('undo after replacing a shift restores the original', () => {
    const dayShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'day' });
    grid.addShift(dayShift);

    const nightShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'night', start_time: '20:00', end_time: '08:00' });
    grid.replaceShift(dayShift, nightShift);
    expect(grid.shiftsFor('doc-1', '2026-03-10')[0].shift_type).toBe('night');

    grid.undo();
    const restored = grid.shiftsFor('doc-1', '2026-03-10');
    expect(restored).toHaveLength(1);
    expect(restored[0].shift_type).toBe('day');
  });

  it('redo after undoing a replacement re-applies the night shift', () => {
    const dayShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'day' });
    grid.addShift(dayShift);

    const nightShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'night' });
    grid.replaceShift(dayShift, nightShift);

    grid.undo(); // back to day
    grid.redo(); // forward to night
    const shifts = grid.shiftsFor('doc-1', '2026-03-10');
    expect(shifts).toHaveLength(1);
    expect(shifts[0].shift_type).toBe('night');
  });

  it('multiple undo/redo cycles with ID changes', () => {
    const shift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    grid.addShift(shift);

    // Cycle 3 times to verify IDs are updated correctly each round
    for (let i = 0; i < 3; i++) {
      grid.undo();
      expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(0);

      grid.redo();
      const shifts = grid.shiftsFor('doc-1', '2026-03-10');
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('day');
    }
  });

  it('undo after clearing a shift restores it', () => {
    const shift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    grid.addShift(shift);
    grid.clearShift(shift);
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(0);

    grid.undo();
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);
  });

  it('redo after undoing a clear re-clears it', () => {
    const shift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    grid.addShift(shift);
    grid.clearShift(shift);

    grid.undo(); // restore shift
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);

    grid.redo(); // re-clear
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(0);
  });

  it('leave days: undo/redo', () => {
    const leave = makeLeave({ doctor_id: 'doc-1', leave_date: '2026-03-12' });
    grid.addLeave(leave);
    expect(grid.leavesFor('doc-1', '2026-03-12')).toHaveLength(1);

    grid.undo();
    expect(grid.leavesFor('doc-1', '2026-03-12')).toHaveLength(0);

    grid.redo();
    expect(grid.leavesFor('doc-1', '2026-03-12')).toHaveLength(1);
  });

  it('new action after undo discards redo history', () => {
    const s1 = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10' });
    const s2 = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-11' });
    grid.addShift(s1);
    grid.addShift(s2);

    grid.undo(); // undo s2
    expect(grid.history.canRedo).toBe(true);

    const s3 = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-12' });
    grid.addShift(s3); // new action, should discard redo for s2
    expect(grid.history.canRedo).toBe(false);

    grid.undo(); // undo s3
    expect(grid.shiftsFor('doc-1', '2026-03-12')).toHaveLength(0);
    expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1); // s1 still there
  });

  it('undo everything then redo everything', () => {
    const s1 = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'day' });
    const s2 = makeShift({ doctor_id: 'doc-2', shift_date: '2026-03-11', shift_type: 'night' });
    grid.addShift(s1);
    grid.addShift(s2);

    // Undo all
    grid.undo();
    grid.undo();
    expect(grid.shifts).toHaveLength(0);

    // Redo all
    grid.redo();
    expect(grid.shifts).toHaveLength(1);
    expect(grid.shifts[0].doctor_id).toBe('doc-1');

    grid.redo();
    expect(grid.shifts).toHaveLength(2);
    expect(grid.shifts[1].doctor_id).toBe('doc-2');

    // Can't redo further
    expect(grid.redo()).toBe(false);
  });

  it('no duplicates after undo/redo of replace', () => {
    const dayShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'day' });
    grid.addShift(dayShift);

    const nightShift = makeShift({ doctor_id: 'doc-1', shift_date: '2026-03-10', shift_type: 'night' });
    grid.replaceShift(dayShift, nightShift);

    // Undo replace, redo replace, undo replace, redo replace
    for (let i = 0; i < 3; i++) {
      grid.undo();
      expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);
      expect(grid.shiftsFor('doc-1', '2026-03-10')[0].shift_type).toBe('day');

      grid.redo();
      expect(grid.shiftsFor('doc-1', '2026-03-10')).toHaveLength(1);
      expect(grid.shiftsFor('doc-1', '2026-03-10')[0].shift_type).toBe('night');
    }
  });
});
