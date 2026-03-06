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

/** Phase 1: small-window backtracking limits. */
const BACKTRACK_MAX_RADIUS = 3;
const BACKTRACK_MAX_NODES = 5_000;
const BACKTRACK_MAX_SLOTS = 30;

/** Phase 2: MAC solver limits. */
const MAC_MAX_NODES = 50_000;
const MAC_MAX_SLOTS = 200;
const MAC_WINDOW_MARGIN = 3;

/** Skip repair if more than this ratio of total slots are unfilled. */
const MAX_REPAIRABLE_RATIO = 0.15;
const MIN_REPAIRABLE_SLOTS = 3;

interface RepairSlot {
  day: number;
  dateStr: string;
  shiftType: 'day' | 'night';
}

/** Pre-computed timing for a slot (date-based, matching detectConflicts). */
interface SlotTiming {
  midnightMs: number;
  restHours: number;
}

/** Pre-computed timing for a base (non-window) shift. */
interface BaseShiftTiming {
  midnightMs: number;
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
      for (const st of ['day', 'night'] as const) {
        const required = st === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${st}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === st).length;
        if (fixedCount + genCount < required) { count++; days.add(day); }
      }
    }
    return { count, days };
  };

  let { count: unfilledCount, days: unfilledDays } = getUnfilled();
  if (unfilledCount === 0 || unfilledCount > maxRepairable) return;

  // ── Phase 1: per-slot backtracking with small windows ──
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(ctx.year, ctx.month, day));
    for (const shiftType of ['day', 'night'] as const) {
      const required = shiftType === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
      const fixedKey = `${dateStr}:${shiftType}`;
      const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
      const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
      if (fixedCount + genCount >= required) continue;

      let repaired = false;
      for (let radius = 2; radius <= BACKTRACK_MAX_RADIUS && !repaired; radius++) {
        repaired = tryBacktrackWindow(ctx, shifts, day, fixedShiftsByDateType, radius);
      }
    }
  }

  // ── Phase 2: swap-based repair for remaining unfilled slots ──
  // For each unfilled slot, find doctors blocked by rest constraints from adjacent
  // shifts, try reassigning those blocking shifts to other doctors to free them up.
  ({ count: unfilledCount, days: unfilledDays } = getUnfilled());
  if (unfilledCount === 0) return;

  trySwapRepair(ctx, shifts, fixedShiftsByDateType, daysInMonth);

  // ── Phase 3: full-window backtracking for any remaining gaps ──
  ({ count: unfilledCount, days: unfilledDays } = getUnfilled());
  if (unfilledCount === 0) return;

  const sortedUnfilled = Array.from(unfilledDays).sort((a, b) => a - b);
  const clusters: { start: number; end: number }[] = [];
  let clusterStart = sortedUnfilled[0];
  let clusterEnd = sortedUnfilled[0];
  for (let i = 1; i < sortedUnfilled.length; i++) {
    if (sortedUnfilled[i] - clusterEnd <= MAC_WINDOW_MARGIN) {
      clusterEnd = sortedUnfilled[i];
    } else {
      clusters.push({ start: clusterStart, end: clusterEnd });
      clusterStart = sortedUnfilled[i];
      clusterEnd = sortedUnfilled[i];
    }
  }
  clusters.push({ start: clusterStart, end: clusterEnd });

  for (const cluster of clusters) {
    const minDay = Math.max(1, cluster.start - MAC_WINDOW_MARGIN);
    const maxDay = Math.min(daysInMonth, cluster.end + MAC_WINDOW_MARGIN);
    tryMACWindow(ctx, shifts, minDay, maxDay, fixedShiftsByDateType);
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
  const DAY_REST_HOURS = SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
  const NIGHT_REST_HOURS = SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;

  // Build per-doctor shift index (only generated shifts, not fixed)
  const shiftsByDoctor = new Map<string, number[]>();
  for (const doc of ctx.doctors) shiftsByDoctor.set(doc.id, []);
  for (let i = 0; i < shifts.length; i++) {
    const arr = shiftsByDoctor.get(shifts[i].doctor_id);
    if (arr) arr.push(i);
  }

  // Pre-compute midnight timestamp and rest hours for each shift
  const shiftInfo: { midnightMs: number; restHours: number; shiftType: 'day' | 'night' }[] = shifts.map(s => {
    const midnightMs = new Date(s.shift_date).getTime();
    const restHours = s.shift_type === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS;
    return { midnightMs, restHours, shiftType: s.shift_type as 'day' | 'night' };
  });

  // Also pre-compute for fixed shifts and previous month shifts
  const fixedShiftInfo: { docId: string; midnightMs: number; restHours: number }[] = [];
  for (const s of ctx.fixedShifts) {
    if (s.shift_type !== 'day' && s.shift_type !== 'night') continue;
    fixedShiftInfo.push({
      docId: s.doctor_id,
      midnightMs: new Date(s.shift_date).getTime(),
      restHours: s.shift_type === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS,
    });
  }
  const prevMonthInfo: { docId: string; midnightMs: number; restHours: number }[] = [];
  for (const s of ctx.previousMonthShifts) {
    if (s.shift_type !== 'day' && s.shift_type !== 'night') continue;
    prevMonthInfo.push({
      docId: s.doctor_id,
      midnightMs: new Date(s.shift_date).getTime(),
      restHours: s.shift_type === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS,
    });
  }

  // Check rest constraint between two shifts using date-based distance (matches detectConflicts)
  function hasRestConflict(
    midnightA: number, restHoursA: number,
    midnightB: number, restHoursB: number
  ): boolean {
    const hoursBetween = Math.abs(midnightB - midnightA) / 3600_000;
    if (midnightA <= midnightB) {
      // A is earlier or same day
      if (hoursBetween < restHoursA) return true;
    }
    if (midnightB <= midnightA) {
      // B is earlier or same day
      if (hoursBetween < restHoursB) return true;
    }
    return false;
  }

  // Check if doctor can work a slot (date-based constraints)
  function canWorkSlot(
    docId: string,
    slotMidnightMs: number,
    slotRestHours: number,
    excludeShiftIdx: Set<number>
  ): boolean {
    const docShifts = shiftsByDoctor.get(docId);
    if (docShifts) {
      for (const si of docShifts) {
        if (excludeShiftIdx.has(si)) continue;
        if (hasRestConflict(shiftInfo[si].midnightMs, shiftInfo[si].restHours, slotMidnightMs, slotRestHours)) {
          return false;
        }
      }
    }
    for (const fi of fixedShiftInfo) {
      if (fi.docId !== docId) continue;
      if (hasRestConflict(fi.midnightMs, fi.restHours, slotMidnightMs, slotRestHours)) return false;
    }
    for (const pi of prevMonthInfo) {
      if (pi.docId !== docId) continue;
      if (hasRestConflict(pi.midnightMs, pi.restHours, slotMidnightMs, slotRestHours)) return false;
    }
    return true;
  }

  // Find which of a doctor's generated shifts block them from a slot
  function findBlockingShifts(
    docId: string,
    slotMidnightMs: number,
    slotRestHours: number
  ): number[] {
    const blockers: number[] = [];
    const docShifts = shiftsByDoctor.get(docId);
    if (!docShifts) return blockers;
    for (const si of docShifts) {
      if (hasRestConflict(shiftInfo[si].midnightMs, shiftInfo[si].restHours, slotMidnightMs, slotRestHours)) {
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
    return canWorkSlot(newDocId, shiftInfo[si].midnightMs, shiftInfo[si].restHours, excludeShiftIdx);
  }

  // Try to free a doctor for a slot by reassigning their blocking shifts
  function tryFreeDoctor(
    docId: string,
    slotMidnightMs: number,
    slotRestHours: number,
    depth: number,
    excludeShiftIdx: Set<number>,
    swapPlan: { shiftIdx: number; newDocId: string }[]
  ): boolean {
    const blockers = findBlockingShifts(docId, slotMidnightMs, slotRestHours);
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
          if (tryFreeDoctor(otherDoc.id, shiftInfo[si].midnightMs, shiftInfo[si].restHours, depth + 1, newExclude, chainPlan)) {
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

  // Verify no rest violations for a set of doctors (matches detectConflicts)
  function verifyNoViolations(affectedDocIds: string[]): boolean {
    for (const docId of affectedDocIds) {
      const docShiftIndices = shiftsByDoctor.get(docId) || [];
      for (let a = 0; a < docShiftIndices.length; a++) {
        const infoA = shiftInfo[docShiftIndices[a]];
        for (let b = a + 1; b < docShiftIndices.length; b++) {
          const infoB = shiftInfo[docShiftIndices[b]];
          if (hasRestConflict(infoA.midnightMs, infoA.restHours, infoB.midnightMs, infoB.restHours)) {
            return false;
          }
        }
      }
      // Also check against fixed and previous month shifts
      for (const fi of fixedShiftInfo) {
        if (fi.docId !== docId) continue;
        for (const si of docShiftIndices) {
          if (hasRestConflict(fi.midnightMs, fi.restHours, shiftInfo[si].midnightMs, shiftInfo[si].restHours)) {
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
      for (const shiftType of ['day', 'night'] as const) {
        const required = shiftType === 'day' ? ctx.shiftsPerDay : ctx.shiftsPerNight;
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
        const needed = required - fixedCount - genCount;
        if (needed <= 0) continue;

        const slotMidnightMs = new Date(dateStr).getTime();
        const slotRestHours = shiftType === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS;
        const date = new Date(ctx.year, ctx.month, day);

        for (let n = 0; n < needed; n++) {
          let filled = false;

          for (const doc of ctx.doctors) {
            if (isDoctorOnLeave(ctx, doc.id, date)) continue;
            if (isDoctorOnBridgeDay(ctx, doc.id, date)) continue;

            // Same-type dedup
            const alreadyOnSlot = shifts.some(
              s => s.shift_date === dateStr && s.shift_type === shiftType && s.doctor_id === doc.id
            );
            if (alreadyOnSlot) continue;

            // Can they work directly?
            if (canWorkSlot(doc.id, slotMidnightMs, slotRestHours, new Set())) {
              const newShift: Shift = {
                id: crypto.randomUUID(),
                doctor_id: doc.id,
                shift_date: dateStr,
                shift_type: shiftType,
                start_time: shiftType === 'day' ? '08:00' : '20:00',
                end_time: shiftType === 'day' ? '20:00' : '08:00',
              };
              shifts.push(newShift);
              shiftInfo.push({ midnightMs: slotMidnightMs, restHours: slotRestHours, shiftType });
              shiftsByDoctor.get(doc.id)!.push(shifts.length - 1);
              filled = true;
              changed = true;
              break;
            }

            // Try swap chain
            const swapPlan: { shiftIdx: number; newDocId: string }[] = [];
            if (tryFreeDoctor(doc.id, slotMidnightMs, slotRestHours, 0, new Set(), swapPlan)) {
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
              shiftInfo.push({ midnightMs: slotMidnightMs, restHours: slotRestHours, shiftType });
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

  const removedShifts: Shift[] = [];
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (windowDates.has(shifts[i].shift_date)) {
      removedShifts.push(shifts[i]);
      shifts.splice(i, 1);
    }
  }

  const slots = buildSlots(ctx, startDay, endDay, fixedShiftsByDateType);
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

  const removedShifts: Shift[] = [];
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (windowDates.has(shifts[i].shift_date)) {
      removedShifts.push(shifts[i]);
      shifts.splice(i, 1);
    }
  }

  const slots = buildSlots(ctx, startDay, endDay, fixedShiftsByDateType);
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
 * Fast constraint check using date-based distance (matches detectConflicts).
 * hoursBetween = |midnight(A) - midnight(B)| / 3600000
 */
function hasDateRestConflict(
  midnightA: number, restHoursA: number,
  midnightB: number, restHoursB: number
): boolean {
  const hoursBetween = Math.abs(midnightB - midnightA) / 3600_000;
  if (midnightA <= midnightB && hoursBetween < restHoursA) return true;
  if (midnightB <= midnightA && hoursBetween < restHoursB) return true;
  return false;
}

function canDoctorWorkSlot(
  slotTiming: SlotTiming,
  doctorBaseShifts: BaseShiftTiming[],
  doctorAssignedSlotIndices: number[],
  slotTimings: SlotTiming[]
): boolean {
  for (const base of doctorBaseShifts) {
    if (hasDateRestConflict(base.midnightMs, base.restHours, slotTiming.midnightMs, slotTiming.restHours)) {
      return false;
    }
  }
  for (const j of doctorAssignedSlotIndices) {
    const other = slotTimings[j];
    if (hasDateRestConflict(other.midnightMs, other.restHours, slotTiming.midnightMs, slotTiming.restHours)) {
      return false;
    }
  }
  return true;
}

function solveWithMAC(
  ctx: EngineContext,
  shifts: Shift[],
  slots: RepairSlot[]
): string[] | null {
  const DAY_REST_HOURS = SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
  const NIGHT_REST_HOURS = SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;

  // ── Pre-compute all slot timings (date-based) ──
  const slotTimings: SlotTiming[] = slots.map(slot => {
    const midnightMs = new Date(slot.dateStr).getTime();
    const restHours = slot.shiftType === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS;
    return { midnightMs, restHours };
  });

  // ── Pre-compute per-doctor base shift timings (outside the window) ──
  const doctorBaseShifts = new Map<string, BaseShiftTiming[]>();
  for (const doc of ctx.doctors) {
    const baseShifts: BaseShiftTiming[] = [];
    const allBase = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === doc.id),
      ...ctx.fixedShifts.filter(s => s.doctor_id === doc.id),
      ...shifts.filter(s => s.doctor_id === doc.id),
    ];
    for (const s of allBase) {
      if (s.shift_type !== 'day' && s.shift_type !== 'night') continue;
      const midnightMs = new Date(s.shift_date).getTime();
      const restHours = s.shift_type === 'day' ? DAY_REST_HOURS : NIGHT_REST_HOURS;
      baseShifts.push({ midnightMs, restHours });
    }
    baseShifts.sort((a, b) => a.midnightMs - b.midnightMs);
    doctorBaseShifts.set(doc.id, baseShifts);
  }

  // ── Pre-compute per-slot candidate lists (filtered by leave, bridge, base rest) ──
  const slotDates = slots.map(s => new Date(ctx.year, ctx.month, s.day));
  const slotCandidates: string[][] = slots.map((_slot, i) => {
    const date = slotDates[i];
    const timing = slotTimings[i];
    const eligible: string[] = [];
    for (const doc of ctx.doctors) {
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
      .filter(doc => !isDoctorOnLeave(ctx, doc.id, date) && !isDoctorOnBridgeDay(ctx, doc.id, date))
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
      if (s.shift_type === 'day' || s.shift_type === 'night') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + SHIFT_HOURS);
      }
    }
    for (const s of shifts) {
      if (s.shift_type === 'day' || s.shift_type === 'night') {
        hours.set(s.doctor_id, (hours.get(s.doctor_id) || 0) + SHIFT_HOURS);
      }
    }

    // Identify deficit and surplus doctors
    const deficits: { id: string; gap: number }[] = [];
    const surplusIds: string[] = [];

    for (const doc of ctx.doctors) {
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

  /**
   * Date-based rest conflict check, consistent with detectConflicts semantics.
   * Uses midnight-to-midnight distance, NOT exact shift start/end times.
   */
  function hasDateBasedRestConflict(
    dateA: string, typeA: string,
    dateB: string, typeB: string
  ): boolean {
    const midnightA = new Date(dateA).getTime();
    const midnightB = new Date(dateB).getTime();
    const hoursBetween = Math.abs(midnightB - midnightA) / 3600_000;

    // Check rest in both directions (earlier shift's rest constrains later shift)
    if (midnightA <= midnightB) {
      if (typeA === 'day' && hoursBetween < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) return true;
      if (typeA === 'night' && hoursBetween < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) return true;
    }
    if (midnightB <= midnightA) {
      if (typeB === 'day' && hoursBetween < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) return true;
      if (typeB === 'night' && hoursBetween < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) return true;
    }
    return false;
  }

  /** Check if doctor can take a specific shift (by index), using date-based rest checks. */
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

    // Check against all existing shifts for this doctor
    const allDocShifts = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === docId),
      ...ctx.fixedShifts.filter(s => s.doctor_id === docId),
      ...shifts.filter(s => s.doctor_id === docId),
    ];
    for (const existing of allDocShifts) {
      if (existing.shift_type !== 'day' && existing.shift_type !== 'night') continue;
      if (hasDateBasedRestConflict(shift.shift_date, shift.shift_type, existing.shift_date, existing.shift_type)) {
        return false;
      }
    }
    return true;
  }

  /** Verify no date-based rest violations in a doctor's schedule. */
  function verifyDoctorSchedule(docId: string): boolean {
    const allDocShifts = [
      ...ctx.previousMonthShifts.filter(s => s.doctor_id === docId),
      ...ctx.fixedShifts.filter(s => s.doctor_id === docId),
      ...shifts.filter(s => s.doctor_id === docId && (s.shift_type === 'day' || s.shift_type === 'night')),
    ];

    for (let i = 0; i < allDocShifts.length; i++) {
      const si = allDocShifts[i];
      if (si.shift_type !== 'day' && si.shift_type !== 'night') continue;
      for (let j = i + 1; j < allDocShifts.length; j++) {
        const sj = allDocShifts[j];
        if (sj.shift_type !== 'day' && sj.shift_type !== 'night') continue;
        if (hasDateBasedRestConflict(si.shift_date, si.shift_type, sj.shift_date, sj.shift_type)) {
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
      if (s.shift_type === 'day' || s.shift_type === 'night') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 1);
      }
    }
    for (const s of shifts) {
      if (s.shift_type === 'day' || s.shift_type === 'night') {
        shiftCounts.set(s.doctor_id, (shiftCounts.get(s.doctor_id) || 0) + 1);
      }
    }
    return ctx.doctors.map(doc => {
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
