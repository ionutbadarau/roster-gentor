import { Doctor, Shift } from '@/types/scheduling';
import { getDaysInMonth } from './calendar-utils';

export interface DispatchAssignment {
  shiftId: string;
  doctorId: string;
  date: string;
  dispatchType: 'day' | 'night';
}

/**
 * Assigns dispatch duty to eligible doctors across the month,
 * distributing as equally as possible.
 * Skips dates that already have a manual dispatch assignment for the given slot.
 */
export function assignDispatch(
  shifts: Shift[],
  doctors: Doctor[],
  month: number,   // 0-based
  year: number,
  manualDispatchDates?: { day: Set<string>; night: Set<string> },
): DispatchAssignment[] {
  const eligibleIds = new Set(
    doctors.filter(d => d.can_dispatch).map(d => d.id)
  );
  if (eligibleIds.size === 0) return [];

  // Build doctor order map for deterministic tie-breaking
  const orderMap = new Map<string, number>();
  for (const d of doctors) {
    orderMap.set(d.id, d.display_order ?? 0);
  }

  // Counter: how many dispatch assignments each eligible doctor has so far
  const counter = new Map<string, number>();
  eligibleIds.forEach(id => {
    counter.set(id, 0);
  });

  // Index shifts by date string
  const daysInMonth = getDaysInMonth(year, month);
  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const existing = shiftsByDate.get(s.shift_date) ?? [];
    existing.push(s);
    shiftsByDate.set(s.shift_date, existing);
  }

  const assignments: DispatchAssignment[] = [];

  // Pre-count manual dispatch assignments so auto-assign balances around them
  if (manualDispatchDates) {
    for (const s of shifts) {
      if (s.is_manual_dispatch && s.dispatch_type && eligibleIds.has(s.doctor_id)) {
        counter.set(s.doctor_id, (counter.get(s.doctor_id) ?? 0) + 1);
      }
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayShifts = shiftsByDate.get(dateStr) ?? [];

    // Day dispatch: skip if manually assigned for this date
    let dayPickDoctorId: string | undefined;
    if (manualDispatchDates?.day.has(dateStr)) {
      dayPickDoctorId = dayShifts.find(s => s.is_manual_dispatch && s.dispatch_type === 'day')?.doctor_id;
    } else {
      const dayCandidates = dayShifts.filter(
        s => (s.shift_type === 'day' || s.shift_type === '24h') && eligibleIds.has(s.doctor_id)
      );
      const dayPick = pickLowestCount(dayCandidates, counter, orderMap);
      if (dayPick) {
        assignments.push({
          shiftId: dayPick.id,
          doctorId: dayPick.doctor_id,
          date: dateStr,
          dispatchType: 'day',
        });
        counter.set(dayPick.doctor_id, (counter.get(dayPick.doctor_id) ?? 0) + 1);
        dayPickDoctorId = dayPick.doctor_id;
      }
    }

    // Night dispatch: skip if manually assigned for this date
    if (manualDispatchDates?.night.has(dateStr)) {
      // Already manually assigned — skip
    } else {
      const nightCandidates = dayShifts.filter(
        s => (s.shift_type === 'night' || s.shift_type === '24h') &&
          eligibleIds.has(s.doctor_id) &&
          s.doctor_id !== dayPickDoctorId
      );
      const nightPick = pickLowestCount(nightCandidates, counter, orderMap);
      if (nightPick) {
        assignments.push({
          shiftId: nightPick.id,
          doctorId: nightPick.doctor_id,
          date: dateStr,
          dispatchType: 'night',
        });
        counter.set(nightPick.doctor_id, (counter.get(nightPick.doctor_id) ?? 0) + 1);
      }
    }
  }

  return assignments;
}

/** Pick the shift whose doctor has the lowest dispatch count; break ties by display_order. */
function pickLowestCount(
  candidates: Shift[],
  counter: Map<string, number>,
  orderMap: Map<string, number>,
): Shift | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestCount = counter.get(best.doctor_id) ?? 0;
  let bestOrder = orderMap.get(best.doctor_id) ?? 0;

  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const count = counter.get(c.doctor_id) ?? 0;
    const order = orderMap.get(c.doctor_id) ?? 0;
    if (count < bestCount || (count === bestCount && order < bestOrder)) {
      best = c;
      bestCount = count;
      bestOrder = order;
    }
  }

  return best;
}
