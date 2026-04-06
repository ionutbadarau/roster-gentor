/**
 * Post-generation shift equalization.
 *
 * Swaps 12h shifts between "equalizable" (EQZB) doctors so that the
 * integer part of every EQZB doctor's "+/- Norm" delta differs by < 2
 * from every other EQZB doctor's delta.
 *
 * EQZB = not optional, not in a team with max_doctors_per_shift, not 24h.
 */

import type { Shift, DoctorWithTeam } from '@/types/scheduling';
import type { ScheduleGenerationOptions } from './constants';
import { SCHEDULING_CONSTANTS } from './constants';
import { SchedulingEngine } from './scheduling-engine';
import { rebuildCounters, calculateBaseNorm } from './stats';
import { isDoctorOnLeave, isDoctorOnBridgeDay } from './constraints';
import { findRestViolationPairs } from './validation';
import { getDaysInMonth, formatDate } from './calendar-utils';

export interface ShiftSwap {
  shiftId: string;
  shiftDate: string;
  shiftType: string;
  fromDoctorId: string;
  toDoctorId: string;
}

export interface EqualizeResult {
  shifts: Shift[];
  swaps: ShiftSwap[];
  iterations: number;
}

const MAX_ITERATIONS = 500;

/**
 * Compute the "+/- Norm" delta in shifts (same formula as the UI).
 * `deltaShifts = (totalHours - baseNorm) / 12`
 */
function computeDelta(engine: SchedulingEngine, doctorId: string): number {
  const totalHours = engine.doctorHours.get(doctorId) || 0;
  const baseNorm = calculateBaseNorm(engine, doctorId);
  return (totalHours - baseNorm) / SCHEDULING_CONSTANTS.SHIFT_DURATION;
}

export function equalizeShifts(
  currentShifts: Shift[],
  options: ScheduleGenerationOptions,
): EqualizeResult {
  // Clone shifts so we don't mutate the input
  const shifts = currentShifts.map(s => ({ ...s }));
  const swaps: ShiftSwap[] = [];

  // Build engine context (bridge days, holiday set, etc.) without generating
  const engine = new SchedulingEngine(options);
  rebuildCounters(engine, shifts);

  // Determine constrained team IDs (teams with max_doctors_per_shift)
  const constrainedTeamIds = new Set(
    options.teams.filter(t => t.max_doctors_per_shift != null).map(t => t.id)
  );

  // EQZB doctors: not optional, not in constrained team, not 24h
  const eqzbDoctors = engine.doctors.filter(d =>
    !d.is_optional &&
    d.shift_mode !== '24h' &&
    !(d.team_id && constrainedTeamIds.has(d.team_id))
  );
  const eqzbIds = new Set(eqzbDoctors.map(d => d.id));

  const daysInMonth = getDaysInMonth(engine.year, engine.month);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Compute deltas for all EQZB doctors
    const deltas = eqzbDoctors.map(d => ({
      doctor: d,
      delta: computeDelta(engine, d.id),
    }));

    deltas.sort((a, b) => a.delta - b.delta);
    const lowest = deltas[0];
    const highest = deltas[deltas.length - 1];

    // Check if equalization is needed
    if (Math.trunc(highest.delta) - Math.trunc(lowest.delta) < 2) {
      return { shifts, swaps, iterations: iter };
    }

    const unDoctor = lowest.doctor;
    const unDelta = lowest.delta;

    // ON doctors: EQZB doctors whose integer-part delta >= 2 more than UN
    const onDoctorIds = new Set(
      deltas
        .filter(d => Math.trunc(d.delta) - Math.trunc(unDelta) >= 2)
        .map(d => d.doctor.id)
    );

    // Build set of shift IDs that are part of rest violations
    const allShifts = [...engine.fixedShifts, ...shifts];
    const violationPairs = findRestViolationPairs(allShifts);
    const violatingShiftIds = new Set<string>();
    for (const vp of violationPairs) {
      violatingShiftIds.add(vp.prevShift.id);
      violatingShiftIds.add(vp.currShift.id);
    }

    // Build delta lookup for ON doctors
    const deltaMap = new Map(deltas.map(d => [d.doctor.id, d.delta]));

    // Find the best shift to steal
    let bestShiftIdx = -1;
    let bestIsViolation = false;
    let bestDonorDelta = -Infinity;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(engine.year, engine.month, day);

      // UN eligibility: not on leave, not on bridge, no existing shift that day
      if (isDoctorOnLeave(engine, unDoctor.id, date)) continue;
      if (isDoctorOnBridgeDay(engine, unDoctor.id, date)) continue;

      const dateStr = formatDate(date);
      const hasShiftThatDay = shifts.some(
        s => s.doctor_id === unDoctor.id && s.shift_date === dateStr
      );
      if (hasShiftThatDay) continue;

      // Check both day and night slots
      for (const shiftType of ['day', 'night'] as const) {
        // Find stealable shifts on this slot from ON doctors
        for (let i = 0; i < shifts.length; i++) {
          const s = shifts[i];
          if (s.shift_date !== dateStr) continue;
          if (s.shift_type !== shiftType) continue;
          if (s.is_manual) continue;
          if (!onDoctorIds.has(s.doctor_id)) continue;
          if (!eqzbIds.has(s.doctor_id)) continue;

          const isViolation = violatingShiftIds.has(s.id);
          const donorDelta = deltaMap.get(s.doctor_id) ?? 0;

          // Priority: violation shifts first, then highest donor delta
          const isBetter =
            (!bestIsViolation && isViolation) ||
            (isViolation === bestIsViolation && donorDelta > bestDonorDelta) ||
            bestShiftIdx === -1;

          if (isBetter) {
            bestShiftIdx = i;
            bestIsViolation = isViolation;
            bestDonorDelta = donorDelta;
          }
        }
      }
    }

    // No swap found — cannot equalize further
    if (bestShiftIdx < 0) {
      return { shifts, swaps, iterations: iter };
    }

    // Execute the swap
    const stolen = shifts[bestShiftIdx];
    swaps.push({
      shiftId: stolen.id,
      shiftDate: stolen.shift_date,
      shiftType: stolen.shift_type,
      fromDoctorId: stolen.doctor_id,
      toDoctorId: unDoctor.id,
    });

    shifts[bestShiftIdx] = { ...stolen, doctor_id: unDoctor.id };
    rebuildCounters(engine, shifts);
  }

  return { shifts, swaps, iterations: MAX_ITERATIONS };
}
