/**
 * Repair phase for unfilled slots after the greedy pass.
 *
 * Phase 1: small-window backtracking (for isolated gaps).
 * Phase 2: MAC solver with pre-computed timestamps and undo-log backtracking
 *          for coordinated gaps across multiple days.
 *
 * Performance: all constraint checks use pre-computed millisecond timestamps
 * to avoid repeated string parsing. Per-doctor assigned slots are tracked
 * incrementally for O(k) checks where k = nearby shifts.
 */

import type { Shift } from '@/types/scheduling';
import type { EngineContext } from './constants';
import { SCHEDULING_CONSTANTS } from './constants';
import { getDaysInMonth, formatDate } from './calendar-utils';
import { isDoctorOnLeave, isDoctorOnBridgeDay, canDoctorWorkWithTimeline } from './constraints';
import { calculateBaseNorm } from './stats';
import { getShiftStartMs, getShiftEndMs, getRestHours, hasActualTimeRestConflict } from './shift-utils';

/** Phase 1: small-window backtracking limits. */
const BACKTRACK_MAX_RADIUS = 3;
const BACKTRACK_MAX_NODES = 5_000;
const BACKTRACK_MAX_SLOTS = 30;

/** Phase 2: MAC solver limits (used by tryMACWindow for small-window repair). */
const MAC_MAX_NODES = 200_000;
const MAC_MAX_SLOTS = 300;

/** Skip repair if more than this ratio of total slots are unfilled. */
const MAX_REPAIRABLE_RATIO = 0.15;
const MIN_REPAIRABLE_SLOTS = 3;

interface RepairSlot {
  day: number;
  dateStr: string;
  shiftType: 'day' | 'night';
}

/** Pre-computed actual timing for a slot or base shift. */
interface ShiftTiming {
  startMs: number;
  endMs: number;
  restHours: number;
}

/**
 * Scan for unfilled slots and attempt to repair them.
 */
export function repairUnfilledSlots(
  ctx: EngineContext,
  shifts: Shift[],
  fixedShiftsByDateType: Map<string, Shift[]>
): void {
  const slotsPerDay = ctx.shiftsPerDay + ctx.shiftsPerNight;
  if (ctx.doctors.length < slotsPerDay) return;

  const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
  const totalSlots = daysInMonth * slotsPerDay;
  const maxRepairable = Math.max(MIN_REPAIRABLE_SLOTS, Math.ceil(totalSlots * MAX_REPAIRABLE_RATIO));

  const getUnfilled = (): { count: number; days: Set<number> } => {
    let count = 0;
    const days = new Set<number>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
      // 24h shifts fill both a day and a night slot
      const gen24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
      for (const st of ['day', 'night'] as const) {
        const required = st === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${st}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === st).length;
        if (fixedCount + genCount + gen24h < required) { count++; days.add(day); }
      }
    }
    return { count, days };
  };

  let { count: unfilledCount } = getUnfilled();
  if (unfilledCount === 0 || unfilledCount > maxRepairable) return;

  // ── Phase 1: per-slot backtracking with small windows ──
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
    const phase1_24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
    for (const shiftType of ['day', 'night'] as const) {
      const required = shiftType === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
      const fixedKey = `${dateStr}:${shiftType}`;
      const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
      const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
      if (fixedCount + genCount + phase1_24h >= required) continue;

      let repaired = false;
      for (let radius = 2; radius <= BACKTRACK_MAX_RADIUS && !repaired; radius++) {
        repaired = tryBacktrackWindow(ctx, shifts, day, fixedShiftsByDateType, radius);
      }
    }
  }

  // ── Phase 2: swap-based repair for remaining unfilled slots ──
  // For each unfilled slot, find doctors blocked by rest constraints from adjacent
  // shifts, try reassigning those blocking shifts to other doctors to free them up.
  ({ count: unfilledCount } = getUnfilled());
  if (unfilledCount === 0) return;

  trySwapRepair(ctx, shifts, fixedShiftsByDateType, daysInMonth);

  // ── Phase 3: per-day sliding-window FC solver ──
  // For each unfilled day (left to right), create a small ±3 day window and
  // re-solve all 12h slots in that window. This keeps each FC solve under ~40
  // slots, which is tractable even for heavy-leave scenarios. Days filled by
  // an earlier window solve are automatically skipped.
  const solverDeadline = Date.now() + 90_000;
  ({ count: unfilledCount } = getUnfilled());
  if (unfilledCount > 0) {
    const FC_WINDOW_RADIUS = 3;
    const { days: unfilledDays3 } = getUnfilled();
    const sortedUnfilled = Array.from(unfilledDays3).sort((a, b) => a - b);
    const solvedDays = new Set<number>();

    for (const day of sortedUnfilled) {
      if (Date.now() > solverDeadline) break;
      if (solvedDays.has(day)) continue;

      // Check if this day is still unfilled (may have been solved by adjacent window)
      const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
      const gen24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
      let stillUnfilled = false;
      for (const st of ['day', 'night'] as const) {
        const required = st === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${st}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === st).length;
        if (fixedCount + genCount + gen24h < required) { stillUnfilled = true; break; }
      }
      if (!stillUnfilled) { solvedDays.add(day); continue; }

      const wStart = Math.max(1, day - FC_WINDOW_RADIUS);
      const wEnd = Math.min(daysInMonth, day + FC_WINDOW_RADIUS);
      tryFullMonthSolve(ctx, shifts, fixedShiftsByDateType, solverDeadline, wStart, wEnd);

      // Mark all days in this window as processed to avoid redundant solves
      for (let d = wStart; d <= wEnd; d++) solvedDays.add(d);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: Swap-based repair
// ────────────────────────────────────────────────────────────────────────────

/**
 * For each unfilled slot, find a doctor blocked only by a rest constraint from
 * an adjacent shift, and try to reassign that blocking shift to another doctor.
 * Supports up to 3-level swap chains.
 *
 * Uses date-based distance matching detectConflicts semantics:
 * hoursBetween = (midnight(dateB) - midnight(dateA)) / 3600000
 * if prevType == 'day': violation if hoursBetween < 24
 * if prevType == 'night': violation if hoursBetween < 48
 */
function trySwapRepair(
  ctx: EngineContext,
  shifts: Shift[],
  fixedShiftsByDateType: Map<string, Shift[]>,
  daysInMonth: number
): void {
  const MAX_CHAIN_DEPTH = 3;

  // Build per-doctor shift index (only generated shifts, not fixed)
  const shiftsByDoctor = new Map<string, number[]>();
  for (const doc of ctx.doctors) shiftsByDoctor.set(doc.id, []);
  for (let i = 0; i < shifts.length; i++) {
    const arr = shiftsByDoctor.get(shifts[i].doctor_id);
    if (arr) arr.push(i);
  }

  // Pre-compute actual start/end/rest for each generated shift (includes 24h)
  const shiftInfo: { startMs: number; endMs: number; restHours: number; shiftType: 'day' | 'night' | '24h' }[] = shifts.map(s => {
    const st = s.shift_type as 'day' | 'night' | '24h';
    return {
      startMs: getShiftStartMs(s.shift_date, st),
      endMs: getShiftEndMs(s.shift_date, st),
      restHours: getRestHours(st),
      shiftType: st,
    };
  });

  // Also pre-compute for fixed shifts and previous month shifts (includes 24h)
  const fixedShiftInfo: { docId: string; startMs: number; endMs: number; restHours: number }[] = [];
  for (const s of ctx.fixedShifts) {
    if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
    const st = s.shift_type as 'day' | 'night' | '24h';
    fixedShiftInfo.push({
      docId: s.doctor_id,
      startMs: getShiftStartMs(s.shift_date, st),
      endMs: getShiftEndMs(s.shift_date, st),
      restHours: getRestHours(st),
    });
  }
  const prevMonthInfo: { docId: string; startMs: number; endMs: number; restHours: number }[] = [];
  for (const s of ctx.previousMonthShifts) {
    if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
    const st = s.shift_type as 'day' | 'night' | '24h';
    prevMonthInfo.push({
      docId: s.doctor_id,
      startMs: getShiftStartMs(s.shift_date, st),
      endMs: getShiftEndMs(s.shift_date, st),
      restHours: getRestHours(st),
    });
  }

  // Check rest constraint between two shifts using actual start/end times
  function hasRestConflict(
    startA: number, endA: number, restHoursA: number,
    startB: number, endB: number, restHoursB: number
  ): boolean {
    // Overlap
    if (startA < endB && startB < endA) return true;
    // A before B
    if (endA <= startB) {
      if ((startB - endA) / 3_600_000 < restHoursA) return true;
    }
    // B before A
    if (endB <= startA) {
      if ((startA - endB) / 3_600_000 < restHoursB) return true;
    }
    return false;
  }

  // Check if doctor can work a slot (actual-time constraints)
  function canWorkSlot(
    docId: string,
    slotStartMs: number,
    slotEndMs: number,
    slotRestHours: number,
    excludeShiftIdx: Set<number>
  ): boolean {
    const docShifts = shiftsByDoctor.get(docId);
    if (docShifts) {
      for (const si of docShifts) {
        if (excludeShiftIdx.has(si)) continue;
        const info = shiftInfo[si];
        if (hasRestConflict(info.startMs, info.endMs, info.restHours, slotStartMs, slotEndMs, slotRestHours)) {
          return false;
        }
      }
    }
    for (const fi of fixedShiftInfo) {
      if (fi.docId !== docId) continue;
      if (hasRestConflict(fi.startMs, fi.endMs, fi.restHours, slotStartMs, slotEndMs, slotRestHours)) return false;
    }
    for (const pi of prevMonthInfo) {
      if (pi.docId !== docId) continue;
      if (hasRestConflict(pi.startMs, pi.endMs, pi.restHours, slotStartMs, slotEndMs, slotRestHours)) return false;
    }
    return true;
  }

  // Find which of a doctor's generated shifts block them from a slot
  function findBlockingShifts(
    docId: string,
    slotStartMs: number,
    slotEndMs: number,
    slotRestHours: number
  ): number[] {
    const blockers: number[] = [];
    const docShifts = shiftsByDoctor.get(docId);
    if (!docShifts) return blockers;
    for (const si of docShifts) {
      const info = shiftInfo[si];
      if (hasRestConflict(info.startMs, info.endMs, info.restHours, slotStartMs, slotEndMs, slotRestHours)) {
        blockers.push(si);
      }
    }
    return blockers;
  }

  // Check if doctor Y can take over shift at index si
  function canTakeOverShift(
    newDocId: string,
    si: number,
    excludeShiftIdx: Set<number>
  ): boolean {
    const date = new Date(shifts[si].shift_date);
    if (isDoctorOnLeave(ctx, newDocId, date)) return false;
    if (isDoctorOnBridgeDay(ctx, newDocId, date)) return false;
    const info = shiftInfo[si];
    return canWorkSlot(newDocId, info.startMs, info.endMs, info.restHours, excludeShiftIdx);
  }

  // Try to free a doctor for a slot by reassigning their blocking shifts
  function tryFreeDoctor(
    docId: string,
    slotStartMs: number,
    slotEndMs: number,
    slotRestHours: number,
    depth: number,
    excludeShiftIdx: Set<number>,
    swapPlan: { shiftIdx: number; newDocId: string }[]
  ): boolean {
    const blockers = findBlockingShifts(docId, slotStartMs, slotEndMs, slotRestHours);
    const remaining = blockers.filter(si => !excludeShiftIdx.has(si));
    if (remaining.length === 0) return true;
    if (remaining.length > 2) return false;
    if (depth >= MAX_CHAIN_DEPTH) return false;

    for (const si of remaining) {
      let found = false;
      const newExclude = new Set(excludeShiftIdx);
      newExclude.add(si);

      for (const otherDoc of ctx.doctors) {
        if (otherDoc.id === docId) continue;
        if (otherDoc.shift_mode === '24h') continue; // 24h doctors don't take 12h shifts
        // Same date+type dedup
        const existingForOther = (shiftsByDoctor.get(otherDoc.id) || []).some(
          j => !newExclude.has(j) && shifts[j].shift_date === shifts[si].shift_date && shifts[j].shift_type === shifts[si].shift_type
        );
        if (existingForOther) continue;

        if (canTakeOverShift(otherDoc.id, si, newExclude)) {
          swapPlan.push({ shiftIdx: si, newDocId: otherDoc.id });
          found = true;
          break;
        }
        // Chain: free otherDoc by moving THEIR blockers.
        // Must still check leave/bridge — canTakeOverShift may have failed
        // for leave reasons, not just rest constraints.
        if (depth + 1 < MAX_CHAIN_DEPTH) {
          const parts = shifts[si].shift_date.split('-').map(Number);
          const shiftDate = new Date(parts[0], parts[1] - 1, parts[2]);
          if (isDoctorOnLeave(ctx, otherDoc.id, shiftDate)) continue;
          if (isDoctorOnBridgeDay(ctx, otherDoc.id, shiftDate)) continue;
          const chainPlan: { shiftIdx: number; newDocId: string }[] = [];
          const siInfo = shiftInfo[si];
          if (tryFreeDoctor(otherDoc.id, siInfo.startMs, siInfo.endMs, siInfo.restHours, depth + 1, newExclude, chainPlan)) {
            swapPlan.push(...chainPlan);
            swapPlan.push({ shiftIdx: si, newDocId: otherDoc.id });
            found = true;
            break;
          }
        }
      }
      if (!found) return false;
    }
    return true;
  }

  // Verify no rest violations for a set of doctors (actual times)
  function verifyNoViolations(affectedDocIds: string[]): boolean {
    for (const docId of affectedDocIds) {
      const docShiftIndices = shiftsByDoctor.get(docId) || [];
      for (let a = 0; a < docShiftIndices.length; a++) {
        const infoA = shiftInfo[docShiftIndices[a]];
        for (let b = a + 1; b < docShiftIndices.length; b++) {
          const infoB = shiftInfo[docShiftIndices[b]];
          if (hasRestConflict(infoA.startMs, infoA.endMs, infoA.restHours, infoB.startMs, infoB.endMs, infoB.restHours)) {
            return false;
          }
        }
      }
      // Also check against fixed and previous month shifts
      for (const fi of fixedShiftInfo) {
        if (fi.docId !== docId) continue;
        for (const si of docShiftIndices) {
          const infoS = shiftInfo[si];
          if (hasRestConflict(fi.startMs, fi.endMs, fi.restHours, infoS.startMs, infoS.endMs, infoS.restHours)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // Iterate unfilled slots
  let changed = true;
  while (changed) {
    changed = false;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
      const swap24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
      for (const shiftType of ['day', 'night'] as const) {
        const required = shiftType === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
        const needed = required - fixedCount - genCount - swap24h;
        if (needed <= 0) continue;

        const slotStartMs = getShiftStartMs(dateStr, shiftType);
        const slotEndMs = getShiftEndMs(dateStr, shiftType);
        const slotRestHours = getRestHours(shiftType);
        const date = new Date(ctx.year, ctx.month, day);

        for (let n = 0; n < needed; n++) {
          let filled = false;

          for (const doc of ctx.doctors) {
            if (doc.shift_mode === '24h') continue; // 24h doctors don't fill 12h slots
            if (isDoctorOnLeave(ctx, doc.id, date)) continue;
            if (isDoctorOnBridgeDay(ctx, doc.id, date)) continue;

            // Same-type dedup
            const alreadyOnSlot = shifts.some(
              s => s.shift_date === dateStr && s.shift_type === shiftType && s.doctor_id === doc.id
            );
            if (alreadyOnSlot) continue;

            // Can they work directly?
            if (canWorkSlot(doc.id, slotStartMs, slotEndMs, slotRestHours, new Set())) {
              const newShift: Shift = {
                id: crypto.randomUUID(),
                doctor_id: doc.id,
                shift_date: dateStr,
                shift_type: shiftType,
                start_time: shiftType === 'day' ? '08:00' : '20:00',
                end_time: shiftType === 'day' ? '20:00' : '08:00',
              };
              shifts.push(newShift);
              shiftInfo.push({ startMs: slotStartMs, endMs: slotEndMs, restHours: slotRestHours, shiftType });
              shiftsByDoctor.get(doc.id)!.push(shifts.length - 1);
              filled = true;
              changed = true;
              break;
            }

            // Try swap chain
            const swapPlan: { shiftIdx: number; newDocId: string }[] = [];
            if (tryFreeDoctor(doc.id, slotStartMs, slotEndMs, slotRestHours, 0, new Set(), swapPlan)) {
              // Save state for undo
              const savedOwners = swapPlan.map(sw => ({
                shiftIdx: sw.shiftIdx,
                oldDocId: shifts[sw.shiftIdx].doctor_id
              }));

              // Execute swaps
              for (const swap of swapPlan) {
                const oldDocId = shifts[swap.shiftIdx].doctor_id;
                const oldArr = shiftsByDoctor.get(oldDocId)!;
                const oldPos = oldArr.indexOf(swap.shiftIdx);
                if (oldPos >= 0) oldArr.splice(oldPos, 1);
                shifts[swap.shiftIdx].doctor_id = swap.newDocId;
                shiftsByDoctor.get(swap.newDocId)!.push(swap.shiftIdx);
              }
              // Add new shift
              const newShift: Shift = {
                id: crypto.randomUUID(),
                doctor_id: doc.id,
                shift_date: dateStr,
                shift_type: shiftType,
                start_time: shiftType === 'day' ? '08:00' : '20:00',
                end_time: shiftType === 'day' ? '20:00' : '08:00',
              };
              shifts.push(newShift);
              shiftInfo.push({ startMs: slotStartMs, endMs: slotEndMs, restHours: slotRestHours, shiftType });
              shiftsByDoctor.get(doc.id)!.push(shifts.length - 1);

              // Verify: collect all affected doctors
              const affectedDocIds: string[] = [doc.id];
              for (const sw of swapPlan) affectedDocIds.push(sw.newDocId);
              for (const so of savedOwners) affectedDocIds.push(so.oldDocId);

              if (!verifyNoViolations(affectedDocIds)) {
                // Undo: remove new shift
                shifts.pop();
                shiftInfo.pop();
                shiftsByDoctor.get(doc.id)!.pop();
                // Undo swaps (reverse)
                for (let si = swapPlan.length - 1; si >= 0; si--) {
                  const swap = swapPlan[si];
                  const saved = savedOwners[si];
                  const newArr = shiftsByDoctor.get(swap.newDocId)!;
                  const newPos = newArr.indexOf(swap.shiftIdx);
                  if (newPos >= 0) newArr.splice(newPos, 1);
                  shifts[swap.shiftIdx].doctor_id = saved.oldDocId;
                  shiftsByDoctor.get(saved.oldDocId)!.push(swap.shiftIdx);
                }
                continue;
              }

              filled = true;
              changed = true;
              break;
            }
          }

          if (!filled) break;
        }
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: Backtracking solver (small windows)
// ────────────────────────────────────────────────────────────────────────────

function tryBacktrackWindow(
  ctx: EngineContext,
  shifts: Shift[],
  unfilledDay: number,
  fixedShiftsByDateType: Map<string, Shift[]>,
  radius: number
): boolean {
  const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
  const startDay = Math.max(1, unfilledDay - radius);
  const endDay = Math.min(daysInMonth, unfilledDay + radius);

  const windowDates = new Set<string>();
  for (let d = startDay; d <= endDay; d++) {
    windowDates.add(formatDate(new Date(ctx.year, ctx.month, d)));
  }

  // Only remove non-24h shifts; 24h shifts are kept and treated as fixed coverage
  const removedShifts: Shift[] = [];
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (windowDates.has(shifts[i].shift_date) && shifts[i].shift_type !== '24h') {
      removedShifts.push(shifts[i]);
      shifts.splice(i, 1);
    }
  }

  // Build effective fixed map including remaining 24h shifts in window
  const effectiveFixed = buildEffectiveFixed(fixedShiftsByDateType, shifts, windowDates);

  const slots = buildSlots(ctx, startDay, endDay, effectiveFixed);
  if (slots.length === 0 || slots.length > BACKTRACK_MAX_SLOTS) {
    shifts.push(...removedShifts);
    return false;
  }

  const result = solveWithBacktracking(ctx, shifts, slots);
  if (result) {
    for (let i = 0; i < slots.length; i++) {
      shifts.push({
        id: crypto.randomUUID(),
        doctor_id: result[i],
        shift_date: slots[i].dateStr,
        shift_type: slots[i].shiftType,
        start_time: slots[i].shiftType === 'day' ? '08:00' : '20:00',
        end_time: slots[i].shiftType === 'day' ? '20:00' : '08:00',
      });
    }
    return true;
  } else {
    shifts.push(...removedShifts);
    return false;
  }
}

function solveWithBacktracking(
  ctx: EngineContext,
  shifts: Shift[],
  slots: RepairSlot[]
): string[] | null {
  const baseTimelines = buildBaseTimelines(ctx, shifts);
  const slotDates = slots.map(s => new Date(ctx.year, ctx.month, s.day));
  const slotCandidates = precomputeCandidates(ctx, slots, slotDates);
  const { slotOrder } = applyMRVOrdering(slots, slotCandidates);

  const assignments: (string | null)[] = new Array(slots.length).fill(null);
  let nodesExplored = 0;

  const doctorRepairShifts = new Map<string, Shift[]>();
  for (const doc of ctx.doctors) doctorRepairShifts.set(doc.id, []);

  const slotAssigned = new Map<string, Set<string>>();
  for (const slot of slots) {
    const key = `${slot.dateStr}:${slot.shiftType}`;
    if (!slotAssigned.has(key)) slotAssigned.set(key, new Set());
  }

  const solve = (orderIdx: number): boolean => {
    if (orderIdx >= slotOrder.length) return true;
    if (++nodesExplored > BACKTRACK_MAX_NODES) return false;

    const idx = slotOrder[orderIdx];
    const slot = slots[idx];
    const date = slotDates[idx];
    const slotKey = `${slot.dateStr}:${slot.shiftType}`;
    const assignedSet = slotAssigned.get(slotKey)!;

    for (const docId of slotCandidates[idx]) {
      if (assignedSet.has(docId)) continue;
      const repairs = doctorRepairShifts.get(docId)!;
      const base = baseTimelines.get(docId)!;
      const fullTimeline = repairs.length > 0 ? base.concat(repairs) : base;

      if (canDoctorWorkWithTimeline(ctx, docId, date, slot.shiftType, fullTimeline)) {
        const repairShift: Shift = {
          id: `repair-${idx}`, doctor_id: docId,
          shift_date: slot.dateStr, shift_type: slot.shiftType,
        };
        assignments[idx] = docId;
        assignedSet.add(docId);
        repairs.push(repairShift);
        if (solve(orderIdx + 1)) return true;
        repairs.pop();
        assignedSet.delete(docId);
        assignments[idx] = null;
      }
    }
    return false;
  };

  return solve(0) ? assignments.map(a => a!) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: MAC solver with pre-computed timestamps
// ────────────────────────────────────────────────────────────────────────────

function tryMACWindow(
  ctx: EngineContext,
  shifts: Shift[],
  startDay: number,
  endDay: number,
  fixedShiftsByDateType: Map<string, Shift[]>
): boolean {
  const windowDates = new Set<string>();
  for (let d = startDay; d <= endDay; d++) {
    windowDates.add(formatDate(new Date(ctx.year, ctx.month, d)));
  }

  // Only remove non-24h shifts; 24h shifts are kept and treated as fixed coverage
  const removedShifts: Shift[] = [];
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (windowDates.has(shifts[i].shift_date) && shifts[i].shift_type !== '24h') {
      removedShifts.push(shifts[i]);
      shifts.splice(i, 1);
    }
  }

  // Build effective fixed map including remaining 24h shifts in window
  const effectiveFixed = buildEffectiveFixed(fixedShiftsByDateType, shifts, windowDates);

  const slots = buildSlots(ctx, startDay, endDay, effectiveFixed);
  if (slots.length === 0 || slots.length > MAC_MAX_SLOTS) {
    shifts.push(...removedShifts);
    return false;
  }

  const result = solveWithMAC(ctx, shifts, slots);
  if (result) {
    for (let i = 0; i < slots.length; i++) {
      shifts.push({
        id: crypto.randomUUID(),
        doctor_id: result[i],
        shift_date: slots[i].dateStr,
        shift_type: slots[i].shiftType,
        start_time: slots[i].shiftType === 'day' ? '08:00' : '20:00',
        end_time: slots[i].shiftType === 'day' ? '20:00' : '08:00',
      });
    }
    return true;
  } else {
    shifts.push(...removedShifts);
    return false;
  }
}

/**
 * Fast constraint check using actual shift start/end times.
 */
function hasTimingRestConflict(a: ShiftTiming, b: ShiftTiming): boolean {
  // Overlap
  if (a.startMs < b.endMs && b.startMs < a.endMs) return true;
  // A before B
  if (a.endMs <= b.startMs && (b.startMs - a.endMs) / 3_600_000 < a.restHours) return true;
  // B before A
  if (b.endMs <= a.startMs && (a.startMs - b.endMs) / 3_600_000 < b.restHours) return true;
  return false;
}

function canDoctorWorkSlot(
  slotTiming: ShiftTiming,
  doctorBaseShifts: ShiftTiming[],
  doctorAssignedSlotIndices: number[],
  slotTimings: ShiftTiming[]
): boolean {
  for (const base of doctorBaseShifts) {
    if (hasTimingRestConflict(base, slotTiming)) return false;
  }
  for (const j of doctorAssignedSlotIndices) {
    if (hasTimingRestConflict(slotTimings[j], slotTiming)) return false;
  }
  return true;
}

function solveWithMAC(
  ctx: EngineContext,
  shifts: Shift[],
  slots: RepairSlot[]
): string[] | null {
  // ── Pre-compute all slot timings (actual times) ──
  const slotTimings: ShiftTiming[] = slots.map(slot => ({
    startMs: getShiftStartMs(slot.dateStr, slot.shiftType),
    endMs: getShiftEndMs(slot.dateStr, slot.shiftType),
    restHours: getRestHours(slot.shiftType),
  }));

  // ── Pre-compute per-doctor base shift timings (outside the window, includes 24h) ──
  const doctorBaseShifts = new Map<string, ShiftTiming[]>();
  for (const doc of ctx.doctors) {
    const baseShifts: ShiftTiming[] = [];
    const allBase = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === doc.id),
      ...ctx.fixedShifts.filter(s => s.doctor_id === doc.id),
      ...shifts.filter(s => s.doctor_id === doc.id),
    ];
    for (const s of allBase) {
      if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
      const st = s.shift_type as 'day' | 'night' | '24h';
      baseShifts.push({
        startMs: getShiftStartMs(s.shift_date, st),
        endMs: getShiftEndMs(s.shift_date, st),
        restHours: getRestHours(st),
      });
    }
    baseShifts.sort((a, b) => a.startMs - b.startMs);
    doctorBaseShifts.set(doc.id, baseShifts);
  }

  // ── Pre-compute per-slot candidate lists (filtered by leave, bridge, base rest) ──
  const slotDates = slots.map(s => new Date(ctx.year, ctx.month, s.day));
  const slotCandidates: string[][] = slots.map((_slot, i) => {
    const date = slotDates[i];
    const timing = slotTimings[i];
    const eligible: string[] = [];
    for (const doc of ctx.doctors) {
      if (doc.shift_mode === '24h') continue; // 24h doctors don't fill 12h slots
      if (isDoctorOnLeave(ctx, doc.id, date)) continue;
      if (isDoctorOnBridgeDay(ctx, doc.id, date)) continue;
      if (canDoctorWorkSlot(timing, doctorBaseShifts.get(doc.id)!, [], slotTimings)) {
        eligible.push(doc.id);
      }
    }
    return eligible;
  });

  // ── Group slots by date+type key for dedup ──
  const slotGroupIndices = new Map<string, number[]>();
  for (let i = 0; i < slots.length; i++) {
    const key = `${slots[i].dateStr}:${slots[i].shiftType}`;
    if (!slotGroupIndices.has(key)) slotGroupIndices.set(key, []);
    slotGroupIndices.get(key)!.push(i);
  }

  const assignments: (string | null)[] = new Array(slots.length).fill(null);
  const doctorAssignedSlots = new Map<string, number[]>();
  for (const doc of ctx.doctors) doctorAssignedSlots.set(doc.id, []);

  let nodesExplored = 0;
  let numAssigned = 0;
  const totalSlots = slots.length;

  // Pre-compute candidate constraint score (lower = more constrained = try first)
  const eligibility = new Map<string, number>();
  for (const doc of ctx.doctors) eligibility.set(doc.id, 0);
  for (const candidates of slotCandidates) {
    for (const id of candidates) {
      eligibility.set(id, (eligibility.get(id) || 0) + 1);
    }
  }
  // Sort each slot's candidates by eligibility (most constrained first)
  for (const candidates of slotCandidates) {
    candidates.sort((a, b) => (eligibility.get(a) || 0) - (eligibility.get(b) || 0));
  }

  // Count valid candidates for a slot (considering current assignments)
  function countValid(idx: number): number {
    const timing = slotTimings[idx];
    const groupKey = `${slots[idx].dateStr}:${slots[idx].shiftType}`;
    const groupIndices = slotGroupIndices.get(groupKey)!;
    let count = 0;
    for (const docId of slotCandidates[idx]) {
      // Same date+type dedup
      let alreadyInGroup = false;
      for (const gi of groupIndices) {
        if (gi !== idx && assignments[gi] === docId) { alreadyInGroup = true; break; }
      }
      if (alreadyInGroup) continue;
      const docAssigned = doctorAssignedSlots.get(docId)!;
      if (canDoctorWorkSlot(timing, doctorBaseShifts.get(docId)!, docAssigned, slotTimings)) {
        count++;
      }
    }
    return count;
  }

  // MRV DFS: pick unassigned slot with fewest valid candidates
  function solve(): boolean {
    if (numAssigned >= totalSlots) return true;
    if (++nodesExplored > MAC_MAX_NODES) return false;

    // MRV: find unassigned slot with fewest valid candidates
    let bestIdx = -1;
    let bestCount = Infinity;
    for (let i = 0; i < totalSlots; i++) {
      if (assignments[i] !== null) continue;
      const c = countValid(i);
      if (c === 0) return false; // Dead end
      if (c < bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return true;

    const timing = slotTimings[bestIdx];
    const groupKey = `${slots[bestIdx].dateStr}:${slots[bestIdx].shiftType}`;
    const groupIndices = slotGroupIndices.get(groupKey)!;

    for (const docId of slotCandidates[bestIdx]) {
      // Same date+type dedup
      let alreadyInGroup = false;
      for (const gi of groupIndices) {
        if (gi !== bestIdx && assignments[gi] === docId) { alreadyInGroup = true; break; }
      }
      if (alreadyInGroup) continue;

      const docAssigned = doctorAssignedSlots.get(docId)!;
      if (!canDoctorWorkSlot(timing, doctorBaseShifts.get(docId)!, docAssigned, slotTimings)) {
        continue;
      }

      // Assign
      assignments[bestIdx] = docId;
      docAssigned.push(bestIdx);
      numAssigned++;

      if (solve()) return true;

      // Backtrack
      docAssigned.pop();
      assignments[bestIdx] = null;
      numAssigned--;
    }
    return false;
  }

  return solve() ? (assignments as string[]) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build an effective fixed-shifts map that includes remaining 24h shifts
 * in the window as "fixed" coverage for both day and night slots.
 */
function buildEffectiveFixed(
  fixedShiftsByDateType: Map<string, Shift[]>,
  shifts: Shift[],
  windowDates: Set<string>
): Map<string, Shift[]> {
  // Deep-clone arrays to avoid mutating the original map
  const effective = new Map<string, Shift[]>();
  fixedShiftsByDateType.forEach((value, key) => {
    effective.set(key, [...value]);
  });
  for (const s of shifts) {
    if (s.shift_type === '24h' && windowDates.has(s.shift_date)) {
      for (const st of ['day', 'night'] as const) {
        const key = `${s.shift_date}:${st}`;
        if (!effective.has(key)) effective.set(key, []);
        effective.get(key)!.push(s);
      }
    }
  }
  return effective;
}

function buildSlots(
  ctx: EngineContext,
  startDay: number,
  endDay: number,
  fixedShiftsByDateType: Map<string, Shift[]>
): RepairSlot[] {
  const slots: RepairSlot[] = [];
  for (let d = startDay; d <= endDay; d++) {
    const dateStr = formatDate(new Date(ctx.year, ctx.month, d));
    for (const st of ['day', 'night'] as const) {
      const required = st === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
      const fixedKey = `${dateStr}:${st}`;
      const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
      for (let s = 0; s < Math.max(0, required - fixedCount); s++) {
        slots.push({ day: d, dateStr, shiftType: st });
      }
    }
  }
  return slots;
}

function buildBaseTimelines(ctx: EngineContext, shifts: Shift[]): Map<string, Shift[]> {
  const timelines = new Map<string, Shift[]>();
  for (const doc of ctx.doctors) {
    timelines.set(doc.id, [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === doc.id),
      ...ctx.fixedShifts.filter(s => s.doctor_id === doc.id),
      ...shifts.filter(s => s.doctor_id === doc.id),
    ]);
  }
  return timelines;
}

function precomputeCandidates(
  ctx: EngineContext,
  slots: RepairSlot[],
  slotDates: Date[]
): string[][] {
  const slotCandidates: string[][] = slots.map((_slot, i) => {
    const date = slotDates[i];
    return ctx.doctors
      .filter(doc => doc.shift_mode !== '24h' && !isDoctorOnLeave(ctx, doc.id, date) && !isDoctorOnBridgeDay(ctx, doc.id, date))
      .map(doc => doc.id);
  });

  const eligibility = new Map<string, number>();
  for (const doc of ctx.doctors) eligibility.set(doc.id, 0);
  for (const candidates of slotCandidates) {
    for (const id of candidates) {
      eligibility.set(id, (eligibility.get(id) || 0) + 1);
    }
  }

  for (const candidates of slotCandidates) {
    candidates.sort((a, b) => (eligibility.get(a) || 0) - (eligibility.get(b) || 0));
  }

  return slotCandidates;
}

function applyMRVOrdering(
  slots: RepairSlot[],
  slotCandidates: string[][]
): { slotOrder: number[] } {
  const slotOrder = slots.map((_, i) => i);
  slotOrder.sort((a, b) => {
    const diff = slotCandidates[a].length - slotCandidates[b].length;
    if (diff !== 0) return diff;
    if (slots[a].day !== slots[b].day) return slots[a].day - slots[b].day;
    return slots[a].shiftType === 'day' ? -1 : 1;
  });
  return { slotOrder };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: Full-month forward-checking solver
// ────────────────────────────────────────────────────────────────────────────

/**
 * Remove all 12h shifts and re-solve the entire month using an optimized
 * forward-checking backtracker with incremental domain tracking.
 *
 * Key optimizations over the old MAC solver:
 * - Pre-computed constraint adjacency graph (O(slots²) once, then O(degree) per assignment)
 * - Incremental domain updates via undo log (no recomputation)
 * - MRV variable ordering with O(slots) linear scan
 * - Forward checking detects dead ends immediately
 *
 * Returns true if a complete assignment was found, false otherwise.
 * On failure, the original 12h shifts are restored.
 */
function tryFullMonthSolve(
  ctx: EngineContext,
  shifts: Shift[],
  fixedShiftsByDateType: Map<string, Shift[]>,
  deadline: number,
  rangeStart?: number,
  rangeEnd?: number
): boolean {
  const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
  const solveStart = rangeStart ?? 1;
  const solveEnd = rangeEnd ?? daysInMonth;
  const doctors12h = ctx.doctors.filter(d => d.shift_mode !== '24h');
  if (doctors12h.length === 0) return false;

  // Build set of dates in the solve range
  const solveDates = new Set<string>();
  for (let d = solveStart; d <= solveEnd; d++) {
    solveDates.add(formatDate(new Date(ctx.year, ctx.month, d)));
  }

  // Save 12h shifts within the solve range for undo on failure
  const saved12h: Shift[] = [];
  for (let i = shifts.length - 1; i >= 0; i--) {
    if ((shifts[i].shift_type === 'day' || shifts[i].shift_type === 'night') && solveDates.has(shifts[i].shift_date)) {
      saved12h.push(shifts[i]);
      shifts.splice(i, 1);
    }
  }

  // Build effective fixed map (24h shifts treated as fixed coverage)
  const effectiveFixed = buildEffectiveFixed(fixedShiftsByDateType, shifts, solveDates);

  // Build 12h slots for the solve range
  const slots = buildSlots(ctx, solveStart, solveEnd, effectiveFixed);
  if (slots.length === 0) {
    shifts.push(...saved12h);
    return false;
  }

  // Pre-compute slot timings
  const slotTimings: ShiftTiming[] = slots.map(slot => ({
    startMs: getShiftStartMs(slot.dateStr, slot.shiftType),
    endMs: getShiftEndMs(slot.dateStr, slot.shiftType),
    restHours: getRestHours(slot.shiftType),
  }));

  // Pre-compute per-doctor base shift timings (24h + previous month + fixed + out-of-window 12h)
  const doctorBase = new Map<string, ShiftTiming[]>();
  for (const doc of ctx.doctors) {
    const base: ShiftTiming[] = [];
    const allBase = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === doc.id),
      ...ctx.fixedShifts.filter(s => s.doctor_id === doc.id),
      ...shifts.filter(s => s.doctor_id === doc.id), // remaining shifts (24h + out-of-window 12h)
    ];
    for (const s of allBase) {
      if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
      const st = s.shift_type as 'day' | 'night' | '24h';
      base.push({
        startMs: getShiftStartMs(s.shift_date, st),
        endMs: getShiftEndMs(s.shift_date, st),
        restHours: getRestHours(st),
      });
    }
    doctorBase.set(doc.id, base);
  }

  // Pre-compute constraint adjacency: which slot pairs conflict via rest
  const adjacency: number[][] = Array.from({ length: slots.length }, () => []);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (hasTimingRestConflict(slotTimings[i], slotTimings[j])) {
        adjacency[i].push(j);
        adjacency[j].push(i);
      }
    }
  }

  // Same day+type groups (dedup: same doctor can't fill multiple slots of same type on same day)
  const slotGroups = new Map<string, number[]>();
  for (let i = 0; i < slots.length; i++) {
    const key = `${slots[i].dateStr}:${slots[i].shiftType}`;
    if (!slotGroups.has(key)) slotGroups.set(key, []);
    slotGroups.get(key)!.push(i);
  }

  // Pre-compute each slot's group and position for symmetry breaking.
  // Within a group, assigned doctor IDs must be in sorted order — this
  // eliminates K! redundant orderings per group (up to 4! = 24).
  const slotGroupInfo: { group: number[]; pos: number }[] = new Array(slots.length);
  slotGroups.forEach(group => {
    for (let p = 0; p < group.length; p++) {
      slotGroupInfo[group[p]] = { group, pos: p };
    }
  });

  // Initial domains: for each slot, which doctors can work it (considering leave, bridge, base rest)
  const domains: Set<string>[] = slots.map((_slot, i) => {
    const date = new Date(ctx.year, ctx.month, _slot.day);
    const timing = slotTimings[i];
    const eligible = new Set<string>();
    for (const doc of doctors12h) {
      if (isDoctorOnLeave(ctx, doc.id, date)) continue;
      if (isDoctorOnBridgeDay(ctx, doc.id, date)) continue;
      let ok = true;
      for (const bt of doctorBase.get(doc.id)!) {
        if (hasTimingRestConflict(bt, timing)) { ok = false; break; }
      }
      if (ok) eligible.add(doc.id);
    }
    return eligible;
  });

  // Sort candidates: most constrained doctors first (eligible for fewest slots)
  const eligibility = new Map<string, number>();
  for (const doc of doctors12h) eligibility.set(doc.id, 0);
  for (const domain of domains) {
    domain.forEach(id => eligibility.set(id, (eligibility.get(id) || 0) + 1));
  }

  // Diagnostic: per-day slot demand vs eligible doctor count
  const daySlotDemand = new Map<number, { daySlots: number; nightSlots: number; dayEligible: Set<string>; nightEligible: Set<string> }>();
  for (let i = 0; i < slots.length; i++) {
    const d = slots[i].day;
    if (!daySlotDemand.has(d)) daySlotDemand.set(d, { daySlots: 0, nightSlots: 0, dayEligible: new Set(), nightEligible: new Set() });
    const entry = daySlotDemand.get(d)!;
    if (slots[i].shiftType === 'day') {
      entry.daySlots++;
      domains[i].forEach(id => entry.dayEligible.add(id));
    } else {
      entry.nightSlots++;
      domains[i].forEach(id => entry.nightEligible.add(id));
    }
  }
  // Log days where eligible doctors < slots needed (tight or infeasible)
  daySlotDemand.forEach((entry, day) => {
    if (entry.dayEligible.size < entry.daySlots || entry.nightEligible.size < entry.nightSlots) {
      console.log(`[FC-solver] TIGHT DAY ${day}: need ${entry.daySlots}D+${entry.nightSlots}N, eligible ${entry.dayEligible.size}D+${entry.nightEligible.size}N`);
    }
  });

  // Log per-doctor eligibility (total slots they can fill)
  const docEligCounts: string[] = [];
  for (const doc of doctors12h) {
    const count = eligibility.get(doc.id) || 0;
    docEligCounts.push(`${doc.id}:${count}`);
  }
  console.log(`[FC-solver] eligibility: ${docEligCounts.join(' ')}`);

  // Check for immediately infeasible slots
  for (let i = 0; i < slots.length; i++) {
    if (domains[i].size === 0) {
      console.log(`[FC-solver] INFEASIBLE: slot ${i} (day ${slots[i].day} ${slots[i].shiftType}) has empty domain!`);
      shifts.push(...saved12h);
      return false;
    }
  }

  // Forward-checking backtracker with time-based random restarts
  const MAX_RESTARTS = 20;
  const solverStartTime = Date.now();

  // Debug logging for solver diagnostics
  const domainSizesList = domains.map(d => d.size);
  const minDomain = Math.min(...domainSizesList);
  const maxDomain = Math.max(...domainSizesList);
  const avgDomain = domainSizesList.reduce((a, b) => a + b, 0) / domainSizesList.length;
  console.log(`[FC-solver] slots=${slots.length} domains=[${minDomain},${maxDomain}] avg=${avgDomain.toFixed(1)} range=[${solveStart}-${solveEnd}]`);

  // Save initial domains for restart restoration
  const initialDomains: string[][] = domains.map(d => Array.from(d));

  type UndoEntry = { slotIdx: number; docId: string };

  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    if (Date.now() > deadline) break;

    // Reset solver state
    const assignments: (string | null)[] = new Array(slots.length).fill(null);
    const domainSizes: number[] = new Array(slots.length);
    let numAssigned = 0;
    let nodesExplored = 0;
    const undoStack: UndoEntry[][] = [];

    // Restore domains from initial snapshot
    for (let i = 0; i < slots.length; i++) {
      domains[i] = new Set(initialDomains[i]);
      domainSizes[i] = domains[i].size;
    }

    // Re-generate candidate ordering: first restart uses most-constrained-first,
    // subsequent restarts use shuffled ordering for search diversity.
    const restartOrdered: string[][] = initialDomains.map(ids => {
      const arr = [...ids];
      if (restart > 0) {
        // Fisher-Yates shuffle
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      } else {
        arr.sort((a, b) => (eligibility.get(a) || 0) - (eligibility.get(b) || 0));
      }
      return arr;
    });

    const assign = (slotIdx: number, docId: string): boolean => {
      assignments[slotIdx] = docId;
      numAssigned++;

      const removed: UndoEntry[] = [];

      // Forward check: remove docId from rest-conflicting neighbor slots
      for (const neighbor of adjacency[slotIdx]) {
        if (assignments[neighbor] !== null) continue;
        if (domains[neighbor].has(docId)) {
          domains[neighbor].delete(docId);
          domainSizes[neighbor]--;
          removed.push({ slotIdx: neighbor, docId });
          if (domainSizes[neighbor] === 0) {
            for (const entry of removed) {
              domains[entry.slotIdx].add(entry.docId);
              domainSizes[entry.slotIdx]++;
            }
            assignments[slotIdx] = null;
            numAssigned--;
            return false;
          }
        }
      }

      // Dedup: remove docId from same day+type siblings
      const groupKey = `${slots[slotIdx].dateStr}:${slots[slotIdx].shiftType}`;
      for (const sibling of slotGroups.get(groupKey)!) {
        if (sibling === slotIdx || assignments[sibling] !== null) continue;
        if (domains[sibling].has(docId)) {
          domains[sibling].delete(docId);
          domainSizes[sibling]--;
          removed.push({ slotIdx: sibling, docId });
          if (domainSizes[sibling] === 0) {
            for (const entry of removed) {
              domains[entry.slotIdx].add(entry.docId);
              domainSizes[entry.slotIdx]++;
            }
            assignments[slotIdx] = null;
            numAssigned--;
            return false;
          }
        }
      }

      undoStack.push(removed);
      return true;
    }

    const unassign = (slotIdx: number): void => {
      const removed = undoStack.pop()!;
      for (const entry of removed) {
        domains[entry.slotIdx].add(entry.docId);
        domainSizes[entry.slotIdx]++;
      }
      assignments[slotIdx] = null;
      numAssigned--;
    }

    const solve = (): boolean => {
      if (numAssigned >= slots.length) return true;
      // Time check every 10000 nodes to amortize Date.now() cost
      if (++nodesExplored % 10_000 === 0) {
        if (Date.now() > deadline) return false;
      }

      // MRV: find unassigned slot with smallest domain
      let bestIdx = -1;
      let bestSize = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (assignments[i] !== null) continue;
        if (domainSizes[i] < bestSize) {
          bestSize = domainSizes[i];
          bestIdx = i;
          if (bestSize <= 1) break;
        }
      }

      if (bestIdx < 0) return true;
      if (bestSize === 0) return false;

      // Symmetry breaking: within same day+type group, enforce sorted doctor IDs.
      // This eliminates K! redundant orderings per group.
      const { group: symGroup, pos: symPos } = slotGroupInfo[bestIdx];
      let minAllowed = '';
      let maxAllowed = '\uffff';
      for (let p = 0; p < symGroup.length; p++) {
        if (p === symPos) continue;
        const a = assignments[symGroup[p]];
        if (a === null) continue;
        if (p < symPos && a > minAllowed) minAllowed = a;
        if (p > symPos && a < maxAllowed) maxAllowed = a;
      }

      for (const docId of restartOrdered[bestIdx]) {
        if (!domains[bestIdx].has(docId)) continue;
        if (docId < minAllowed || docId > maxAllowed) continue; // symmetry break

        if (assign(bestIdx, docId)) {
          if (solve()) return true;
          unassign(bestIdx);
        }
      }

      return false;
    }

    if (solve()) {
      console.log(`[FC-solver] SOLVED on restart ${restart} (${nodesExplored} nodes, ${Date.now() - solverStartTime}ms)`);
      // Apply solution
      for (let i = 0; i < slots.length; i++) {
        shifts.push({
          id: crypto.randomUUID(),
          doctor_id: assignments[i]!,
          shift_date: slots[i].dateStr,
          shift_type: slots[i].shiftType,
          start_time: slots[i].shiftType === 'day' ? '08:00' : '20:00',
          end_time: slots[i].shiftType === 'day' ? '20:00' : '08:00',
        });
      }
      return true;
    }
    console.log(`[FC-solver] restart ${restart} exhausted (${nodesExplored} nodes, ${Date.now() - solverStartTime}ms)`);
  }

  // All restarts failed — restore original 12h shifts
  console.log(`[FC-solver] ALL RESTARTS FAILED after ${Date.now() - solverStartTime}ms`);
  shifts.push(...saved12h);
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 4: Norm equalization — swap shifts from surplus to deficit doctors
// ────────────────────────────────────────────────────────────────────────────

/**
 * After the greedy + repair passes, some doctors may be below their base norm
 * even though the total math is feasible. This function swaps shifts from
 * surplus doctors (above norm) to deficit doctors (below norm), maintaining
 * all hard constraints (rest, leave, bridge, coverage).
 */
export function repairNormDeficits(ctx: EngineContext, shifts: Shift[]): void {
  const MAX_ITERATIONS = 200;
  const SHIFT_HOURS = SCHEDULING_CONSTANTS.SHIFT_DURATION;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Compute current hours per doctor (including fixed shifts)
    const hours = new Map<string, number>();
    for (const doc of ctx.doctors) hours.set(doc.id, 0);

    for (const s of ctx.fixedShifts) {
      if (s.shift_type === '24h') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + 24);
      } else if (s.shift_type === 'day' || s.shift_type === 'night') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + SHIFT_HOURS);
      }
    }
    for (const s of shifts) {
      if (s.shift_type === '24h') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + 24);
      } else if (s.shift_type === 'day' || s.shift_type === 'night') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + SHIFT_HOURS);
      }
    }

    // Identify deficit and surplus doctors
    const deficits: { id: string; gap: number }[] = [];
    const surplusIds: string[] = [];

    for (const doc of ctx.doctors) {
      if (doc.shift_mode === '24h') continue; // 24h doctors managed separately
      const norm = calculateBaseNorm(ctx, doc.id);
      const h = hours.get(doc.id) || 0;
      if (h < norm) {
        deficits.push({ id: doc.id, gap: norm - h });
      } else if (h > norm) {
        surplusIds.push(doc.id);
      }
    }

    if (deficits.length === 0) return; // All doctors meet norm
    if (surplusIds.length === 0) return; // No surplus to redistribute

    // Sort deficit by largest gap first
    deficits.sort((a, b) => b.gap - a.gap);

    let swapped = false;

    for (const deficit of deficits) {
      for (const surplusId of surplusIds) {
        const surplusNorm = calculateBaseNorm(ctx, surplusId);
        const surplusHours = hours.get(surplusId) || 0;
        // Surplus doctor must still meet their own norm after losing a shift
        if (surplusHours - SHIFT_HOURS < surplusNorm) continue;

        // Build deficit doctor's timeline for constraint checking
        const deficitTimeline: Shift[] = [
          ...ctx.previousMonthShifts.filter(s => s.doctor_id === deficit.id),
          ...ctx.fixedShifts.filter(s => s.doctor_id === deficit.id),
          ...shifts.filter(s => s.doctor_id === deficit.id),
        ];

        // Try each of the surplus doctor's generated shifts
        for (let si = 0; si < shifts.length; si++) {
          const shift = shifts[si];
          if (shift.doctor_id !== surplusId) continue;
          if (shift.shift_type !== 'day' && shift.shift_type !== 'night') continue;

          const parts = shift.shift_date.split('-').map(Number);
          const date = new Date(parts[0], parts[1] - 1, parts[2]);

          // Skip if deficit doctor can't work this day
          if (isDoctorOnLeave(ctx, deficit.id, date)) continue;
          if (isDoctorOnBridgeDay(ctx, deficit.id, date)) continue;

          // Skip if deficit doctor already has a shift of same type on this day
          const alreadyOnSlot = shifts.some(
            s => s.doctor_id === deficit.id &&
              s.shift_date === shift.shift_date &&
              s.shift_type === shift.shift_type
          );
          if (alreadyOnSlot) continue;

          // Check rest constraints for the deficit doctor
          if (canDoctorWorkWithTimeline(ctx, deficit.id, date, shift.shift_type as 'day' | 'night', deficitTimeline)) {
            // Execute swap: reassign shift from surplus to deficit
            shifts[si].doctor_id = deficit.id;
            swapped = true;
            break;
          }
        }

        if (swapped) break;
      }

      if (swapped) break;
    }

    if (swapped) continue;

    // Direct swaps failed. Try chain transfer: surplus → middle → deficit.
    // Middle doctor keeps the same total shifts (gains one from surplus, loses one to deficit).
    for (const deficit of deficits) {
      if (swapped) break;
      for (const surplusId of surplusIds) {
        if (swapped) break;
        const surplusNorm = calculateBaseNorm(ctx, surplusId);
        const surplusHours = hours.get(surplusId) || 0;
        if (surplusHours - SHIFT_HOURS < surplusNorm) continue;

        // Pre-index shifts by doctor
        const shiftsByDoctor = new Map<string, number[]>();
        for (const doc of ctx.doctors) shiftsByDoctor.set(doc.id, []);
        for (let i = 0; i < shifts.length; i++) {
          if (shifts[i].shift_type === 'day' || shifts[i].shift_type === 'night') {
            shiftsByDoctor.get(shifts[i].doctor_id)?.push(i);
          }
        }

        const surplusShifts = shiftsByDoctor.get(surplusId) || [];

        for (const middleDoc of ctx.doctors) {
          if (swapped) break;
          if (middleDoc.shift_mode === '24h') continue;
          if (middleDoc.id === surplusId || middleDoc.id === deficit.id) continue;

          const middleShifts = shiftsByDoctor.get(middleDoc.id) || [];

          for (const si of surplusShifts) {
            if (swapped) break;
            // Can middle take surplus's shift si?
            const shiftSi = shifts[si];
            const partsSi = shiftSi.shift_date.split('-').map(Number);
            const dateSi = new Date(partsSi[0], partsSi[1] - 1, partsSi[2]);
            if (isDoctorOnLeave(ctx, middleDoc.id, dateSi)) continue;
            if (isDoctorOnBridgeDay(ctx, middleDoc.id, dateSi)) continue;
            const middleAlready = shifts.some(
              s => s.doctor_id === middleDoc.id && s.shift_date === shiftSi.shift_date && s.shift_type === shiftSi.shift_type
            );
            if (middleAlready) continue;

            const middleTimeline: Shift[] = [
              ...ctx.previousMonthShifts.filter(s => s.doctor_id === middleDoc.id),
              ...ctx.fixedShifts.filter(s => s.doctor_id === middleDoc.id),
              ...shifts.filter(s => s.doctor_id === middleDoc.id),
            ];
            if (!canDoctorWorkWithTimeline(ctx, middleDoc.id, dateSi, shiftSi.shift_type as 'day' | 'night', middleTimeline)) continue;

            for (const mi of middleShifts) {
              const shiftMi = shifts[mi];
              const partsMi = shiftMi.shift_date.split('-').map(Number);
              const dateMi = new Date(partsMi[0], partsMi[1] - 1, partsMi[2]);
              if (isDoctorOnLeave(ctx, deficit.id, dateMi)) continue;
              if (isDoctorOnBridgeDay(ctx, deficit.id, dateMi)) continue;
              const deficitAlready = shifts.some(
                s => s.doctor_id === deficit.id && s.shift_date === shiftMi.shift_date && s.shift_type === shiftMi.shift_type
              );
              if (deficitAlready) continue;

              // Tentatively execute the chain
              const oldSi = shifts[si].doctor_id;
              const oldMi = shifts[mi].doctor_id;
              shifts[si].doctor_id = middleDoc.id;
              shifts[mi].doctor_id = deficit.id;

              // Verify both new schedules
              const newMiddleTimeline: Shift[] = [
                ...ctx.previousMonthShifts.filter(s => s.doctor_id === middleDoc.id),
                ...ctx.fixedShifts.filter(s => s.doctor_id === middleDoc.id),
                ...shifts.filter(s => s.doctor_id === middleDoc.id),
              ];
              const newDeficitTimeline: Shift[] = [
                ...ctx.previousMonthShifts.filter(s => s.doctor_id === deficit.id),
                ...ctx.fixedShifts.filter(s => s.doctor_id === deficit.id),
                ...shifts.filter(s => s.doctor_id === deficit.id),
              ];

              let valid = true;
              // Check middle doctor's full schedule for rest violations
              for (const s of newMiddleTimeline) {
                if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
                for (const s2 of newMiddleTimeline) {
                  if (s === s2) continue;
                  if (s2.shift_type !== 'day' && s2.shift_type !== 'night' && s2.shift_type !== '24h') continue;
                  if (hasActualTimeRestConflict(s.shift_date, s.shift_type as 'day' | 'night' | '24h', s2.shift_date, s2.shift_type as 'day' | 'night' | '24h')) {
                    valid = false;
                    break;
                  }
                }
                if (!valid) break;
              }
              if (valid) {
                for (const s of newDeficitTimeline) {
                  if (s.shift_type !== 'day' && s.shift_type !== 'night' && s.shift_type !== '24h') continue;
                  for (const s2 of newDeficitTimeline) {
                    if (s === s2) continue;
                    if (s2.shift_type !== 'day' && s2.shift_type !== 'night' && s2.shift_type !== '24h') continue;
                    if (hasActualTimeRestConflict(s.shift_date, s.shift_type as 'day' | 'night' | '24h', s2.shift_date, s2.shift_type as 'day' | 'night' | '24h')) {
                      valid = false;
                      break;
                    }
                  }
                  if (!valid) break;
                }
              }

              if (valid) {
                swapped = true;
                break;
              }

              // Undo
              shifts[si].doctor_id = oldSi;
              shifts[mi].doctor_id = oldMi;
            }
          }
        }
      }
    }

    if (!swapped) return; // No more beneficial swaps possible
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 5: Extra-shift equalization — even out shifts beyond base norm
// ────────────────────────────────────────────────────────────────────────────

/**
 * After all other passes, doctors may have unequal numbers of extra shifts
 * (shifts beyond their base norm). This function swaps shifts from doctors
 * with the most extra shifts to those with the fewest, targeting a max gap
 * of MAX_EXTRA_SHIFT_GAP between any two doctors.
 */
export function repairExtraShiftEqualization(ctx: EngineContext, shifts: Shift[]): void {
  const MAX_ITERATIONS = 300;
  const MAX_EXTRA_SHIFT_GAP = 1;
  const SHIFT_HOURS = SCHEDULING_CONSTANTS.SHIFT_DURATION;

  /** Check if doctor can take a specific shift (by index), using actual-time rest checks. */
  function canTakeShift(docId: string, si: number): boolean {
    const shift = shifts[si];
    const parts = shift.shift_date.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isDoctorOnLeave(ctx, docId, date)) return false;
    if (isDoctorOnBridgeDay(ctx, docId, date)) return false;
    const alreadyOnSlot = shifts.some(
      s => s.doctor_id === docId && s.shift_date === shift.shift_date && s.shift_type === shift.shift_type
    );
    if (alreadyOnSlot) return false;

    // Check against all existing shifts for this doctor (includes 24h)
    const allDocShifts = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === docId),
      ...ctx.fixedShifts.filter(s => s.doctor_id === docId),
      ...shifts.filter(s => s.doctor_id === docId),
    ];
    for (const existing of allDocShifts) {
      if (existing.shift_type !== 'day' && existing.shift_type !== 'night' && existing.shift_type !== '24h') continue;
      if (hasActualTimeRestConflict(
        shift.shift_date, shift.shift_type as 'day' | 'night' | '24h',
        existing.shift_date, existing.shift_type as 'day' | 'night' | '24h',
      )) {
        return false;
      }
    }
    return true;
  }

  /** Verify no rest violations in a doctor's schedule using actual times. */
  function verifyDoctorSchedule(docId: string): boolean {
    const allDocShifts = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === docId),
      ...ctx.fixedShifts.filter(s => s.doctor_id === docId),
      ...shifts.filter(s => s.doctor_id === docId),
    ].filter(s => s.shift_type === 'day' || s.shift_type === 'night' || s.shift_type === '24h');

    for (let i = 0; i < allDocShifts.length; i++) {
      const si = allDocShifts[i];
      for (let j = i + 1; j < allDocShifts.length; j++) {
        const sj = allDocShifts[j];
        if (hasActualTimeRestConflict(
          si.shift_date, si.shift_type as 'day' | 'night' | '24h',
          sj.shift_date, sj.shift_type as 'day' | 'night' | '24h',
        )) {
          return false;
        }
      }
    }
    return true;
  }

  function computeExtras(): { id: string; extra: number }[] {
    const shiftCounts = new Map<string, number>();
    for (const doc of ctx.doctors) shiftCounts.set(doc.id, 0);
    for (const s of ctx.fixedShifts) {
      if (s.shift_type === '24h') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 2);
      } else if (s.shift_type === 'day' || s.shift_type === 'night') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 1);
      }
    }
    for (const s of shifts) {
      if (s.shift_type === '24h') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 2);
      } else if (s.shift_type === 'day' || s.shift_type === 'night') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 1);
      }
    }
    return ctx.doctors
      .filter(doc => doc.shift_mode !== '24h')
      .map(doc => {
        const norm = calculateBaseNorm(ctx, doc.id);
        const baseTarget = Math.ceil(norm / SHIFT_HOURS);
        return { id: doc.id, extra: (shiftCounts.get(doc.id) || 0) - baseTarget };
      });
  }

  /** Try direct transfer: reassign a shift from surplus to deficit. */
  function tryDirectTransfer(surplusId: string, deficitId: string): boolean {
    const surplusNorm = calculateBaseNorm(ctx, surplusId);
    const surplusShiftCount = shifts.filter(s => s.doctor_id === surplusId && (s.shift_type === 'day' || s.shift_type === 'night')).length
      + ctx.fixedShifts.filter(s => s.doctor_id === surplusId && (s.shift_type === 'day' || s.shift_type === 'night')).length;
    if (surplusShiftCount * SHIFT_HOURS - SHIFT_HOURS < surplusNorm) return false;

    for (let si = 0; si < shifts.length; si++) {
      if (shifts[si].doctor_id !== surplusId) continue;
      if (shifts[si].shift_type !== 'day' && shifts[si].shift_type !== 'night') continue;
      if (canTakeShift(deficitId, si)) {
        shifts[si].doctor_id = deficitId;
        return true;
      }
    }
    return false;
  }

  /**
   * Chain transfer: surplus → middle, middle → deficit.
   * Surplus loses 1 shift, middle ±0, deficit gains 1.
   */
  function tryChainTransfer(surplusId: string, deficitId: string): boolean {
    const surplusNorm = calculateBaseNorm(ctx, surplusId);
    const surplusShiftCount = shifts.filter(s => s.doctor_id === surplusId && (s.shift_type === 'day' || s.shift_type === 'night')).length
      + ctx.fixedShifts.filter(s => s.doctor_id === surplusId && (s.shift_type === 'day' || s.shift_type === 'night')).length;
    if (surplusShiftCount * SHIFT_HOURS - SHIFT_HOURS < surplusNorm) return false;

    // Pre-index shifts by doctor for performance
    const shiftsByDoctor = new Map<string, number[]>();
    for (const doc of ctx.doctors) shiftsByDoctor.set(doc.id, []);
    for (let i = 0; i < shifts.length; i++) {
      if (shifts[i].shift_type === 'day' || shifts[i].shift_type === 'night') {
        shiftsByDoctor.get(shifts[i].doctor_id)?.push(i);
      }
    }

    const surplusShifts = shiftsByDoctor.get(surplusId) || [];

    for (const middleDoc of ctx.doctors) {
      if (middleDoc.shift_mode === '24h') continue;
      if (middleDoc.id === surplusId || middleDoc.id === deficitId) continue;

      const middleShifts = shiftsByDoctor.get(middleDoc.id) || [];

      for (const si of surplusShifts) {
        // Can middle take surplus's shift si?
        if (!canTakeShift(middleDoc.id, si)) continue;

        // Middle can take si. Now find a shift of middle that deficit can take.
        for (const mi of middleShifts) {
          if (!canTakeShift(deficitId, mi)) continue;

          // Found candidate chain: si (surplus→middle), mi (middle→deficit)
          // Execute tentatively
          const oldSurplusOwner = shifts[si].doctor_id;
          const oldMiddleOwner = shifts[mi].doctor_id;
          shifts[si].doctor_id = middleDoc.id;
          shifts[mi].doctor_id = deficitId;

          // Verify middle doctor's schedule is still valid after gaining si and losing mi
          if (verifyDoctorSchedule(middleDoc.id) && verifyDoctorSchedule(deficitId)) {
            return true; // Chain successful
          }

          // Undo
          shifts[si].doctor_id = oldSurplusOwner;
          shifts[mi].doctor_id = oldMiddleOwner;
        }
      }
    }
    return false;
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const extras = computeExtras();
    extras.sort((a, b) => b.extra - a.extra);
    const maxExtra = extras[0];
    const minExtra = extras[extras.length - 1];

    if (maxExtra.extra - minExtra.extra <= MAX_EXTRA_SHIFT_GAP) return;

    // Try all surplus doctors (those with extra > minExtra + MAX_EXTRA_SHIFT_GAP)
    let progress = false;
    for (const surplus of extras) {
      if (surplus.extra - minExtra.extra <= MAX_EXTRA_SHIFT_GAP) break;
      // Try direct transfer first
      if (tryDirectTransfer(surplus.id, minExtra.id)) { progress = true; break; }
    }
    if (progress) continue;

    // Try chain transfers for all surplus doctors
    for (const surplus of extras) {
      if (surplus.extra - minExtra.extra <= MAX_EXTRA_SHIFT_GAP) break;
      if (tryChainTransfer(surplus.id, minExtra.id)) { progress = true; break; }
    }
    if (!progress) return;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 6: Iterated Local Search for remaining unfilled slots
// ────────────────────────────────────────────────────────────────────────────

/**
 * Perturb-and-rebuild repair: remove random 12h shifts near unfilled days,
 * then greedily re-fill all gaps using MRV day ordering (tightest days first)
 * with shuffled doctor ordering. Iterate until all slots are filled or the
 * time budget is exhausted.
 */
export function repairWithLocalSearch(
  ctx: EngineContext,
  shifts: Shift[],
  fixedShiftsByDateType: Map<string, Shift[]>,
  timeBudgetMs: number = 2000
): void {
  const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
  const doctors12h = ctx.doctors.filter(d => d.shift_mode !== '24h');
  const slotsPerDay = ctx.shiftsPerDay + ctx.shiftsPerNight;
  const totalSlots = daysInMonth * slotsPerDay;

  // Skip ILS when too many slots are unfilled (hopeless scenarios like very few doctors)
  const maxRepairable = Math.max(3, Math.ceil(totalSlots * MAX_REPAIRABLE_RATIO));

  const PERTURB_RADIUS = 5;
  const PERTURB_COUNT = 50;
  const startTime = Date.now();

  // Pre-compute MRV day ordering: tightest days first (fewest available 12h doctors)
  const dayOrder: number[] = [];
  {
    const dayAvail: { day: number; avail: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(ctx.year, ctx.month, day);
      let avail = 0;
      for (const doc of doctors12h) {
        if (!isDoctorOnLeave(ctx, doc.id, date) && !isDoctorOnBridgeDay(ctx, doc.id, date)) avail++;
      }
      dayAvail.push({ day, avail });
    }
    dayAvail.sort((a, b) => a.avail - b.avail);
    for (const d of dayAvail) dayOrder.push(d.day);
  }

  // Pre-compute immutable base shifts per doctor (previous month + fixed)
  const doctorBaseShifts = new Map<string, Shift[]>();
  for (const doc of ctx.doctors) {
    doctorBaseShifts.set(doc.id, [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === doc.id),
      ...ctx.fixedShifts.filter(s => s.doctor_id === doc.id),
    ]);
  }

  function getUnfilledInfo(): { count: number; days: Set<number> } {
    let count = 0;
    const days = new Set<number>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
      const gen24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
      for (const st of ['day', 'night'] as const) {
        const required = st === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${st}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === st).length;
        if (fixedCount + genCount + gen24h < required) { count++; days.add(day); }
      }
    }
    return { count, days };
  }

  let { count: bestUnfilled, days: unfilledDays } = getUnfilledInfo();
  if (bestUnfilled === 0 || bestUnfilled > maxRepairable) return;
  let bestSnapshot = shifts.map(s => ({ ...s }));

  for (let iter = 0; ; iter++) {
    if (Date.now() - startTime > timeBudgetMs) break;
    if (bestUnfilled === 0) break;

    // Restore to best known state
    shifts.length = 0;
    for (const s of bestSnapshot) shifts.push({ ...s });

    // Find removable 12h shifts near unfilled days
    const removable: number[] = [];
    for (let i = 0; i < shifts.length; i++) {
      if (shifts[i].shift_type !== 'day' && shifts[i].shift_type !== 'night') continue;
      const parts = shifts[i].shift_date.split('-').map(Number);
      const day = parts[2];
      let nearUnfilled = false;
      unfilledDays.forEach(uDay => {
        if (Math.abs(day - uDay) <= PERTURB_RADIUS) nearUnfilled = true;
      });
      if (nearUnfilled) removable.push(i);
    }

    // Shuffle and remove a random subset
    for (let i = removable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [removable[i], removable[j]] = [removable[j], removable[i]];
    }
    const toRemove = new Set(removable.slice(0, PERTURB_COUNT));
    for (let i = shifts.length - 1; i >= 0; i--) {
      if (toRemove.has(i)) shifts.splice(i, 1);
    }

    // Build per-doctor shift index including base shifts (prev month + fixed)
    const docIndex = new Map<string, Shift[]>();
    for (const doc of ctx.doctors) {
      docIndex.set(doc.id, [...(doctorBaseShifts.get(doc.id) || [])]);
    }
    for (const s of shifts) {
      const arr = docIndex.get(s.doctor_id);
      if (arr) arr.push(s);
    }

    // Shuffled doctor order (different each iteration)
    const shuffled = [...doctors12h];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Greedy re-fill: MRV day ordering (tightest days first)
    for (const day of dayOrder) {
      const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
      const date = new Date(ctx.year, ctx.month, day);
      const gen24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;

      for (const shiftType of ['day', 'night'] as const) {
        const required = shiftType === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
        let needed = required - fixedCount - genCount - gen24h;
        if (needed <= 0) continue;

        for (const doc of shuffled) {
          if (needed <= 0) break;
          if (isDoctorOnLeave(ctx, doc.id, date)) continue;
          if (isDoctorOnBridgeDay(ctx, doc.id, date)) continue;
          // Skip if already assigned to this slot type on this day
          const docShifts = docIndex.get(doc.id)!;
          if (docShifts.some(s => s.shift_date === dateStr && s.shift_type === shiftType)) continue;

          if (canDoctorWorkWithTimeline(ctx, doc.id, date, shiftType, docShifts)) {
            const newShift: Shift = {
              id: crypto.randomUUID(),
              doctor_id: doc.id,
              shift_date: dateStr,
              shift_type: shiftType,
              start_time: shiftType === 'day' ? '08:00' : '20:00',
              end_time: shiftType === 'day' ? '20:00' : '08:00',
            };
            shifts.push(newShift);
            docShifts.push(newShift);
            needed--;
          }
        }
      }
    }

    const { count: currentUnfilled, days: currentUnfilledDays } = getUnfilledInfo();
    if (currentUnfilled < bestUnfilled) {
      bestUnfilled = currentUnfilled;
      bestSnapshot = shifts.map(s => ({ ...s }));
      unfilledDays = currentUnfilledDays;
    }
  }

  // Apply best result
  shifts.length = 0;
  for (const s of bestSnapshot) shifts.push(s);
}
