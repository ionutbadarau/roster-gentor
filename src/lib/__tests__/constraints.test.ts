import { describe, it, expect } from 'vitest';
import { isDoctorOnLeave, canDoctorWork } from '@/lib/scheduling/constraints';
import type { EngineContext } from '@/lib/scheduling/constants';
import type { DoctorWithTeam, LeaveDay } from '@/types/scheduling';

let idCounter = 0;
function uid(): string {
  return `id-${++idCounter}`;
}

function makeLeaveDay(
  doctorId: string,
  date: string,
  leaveType?: 'regular' | 'bridge' | 'no_bridge'
): LeaveDay {
  return { id: uid(), doctor_id: doctorId, leave_date: date, leave_type: leaveType };
}

function makeCtx(leaveDays: LeaveDay[]): EngineContext {
  return {
    leaveDays,
    doctorBridgeDays: new Map(),
    doctorLastShift: new Map(),
    fixedShiftsByDoctor: new Map(),
    doctorWeeklyHours: new Map(),
  } as unknown as EngineContext;
}

function makeDoctor(id: string): DoctorWithTeam {
  return { id, name: `Dr ${id}`, is_floating: false, preferences: {} };
}

describe('isDoctorOnLeave', () => {
  const docId = 'doc-1';
  const date = new Date(2026, 3, 13); // April 13, 2026
  const dateStr = '2026-04-13';

  it('returns true for regular leave', () => {
    const ctx = makeCtx([makeLeaveDay(docId, dateStr, 'regular')]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(true);
  });

  it('returns true when leave_type is undefined (legacy rows)', () => {
    const ctx = makeCtx([makeLeaveDay(docId, dateStr)]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(true);
  });

  it('returns true for bridge sentinel — manual bridge rows must block (auto-bridge map only covers algorithmically detected ones)', () => {
    const ctx = makeCtx([makeLeaveDay(docId, dateStr, 'bridge')]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(true);
  });

  it('returns false for no_bridge sentinel — doctor must remain available', () => {
    const ctx = makeCtx([makeLeaveDay(docId, dateStr, 'no_bridge')]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(false);
  });

  it('returns false for a different doctor', () => {
    const ctx = makeCtx([makeLeaveDay('other-doc', dateStr, 'regular')]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(false);
  });

  it('returns false for a different date', () => {
    const ctx = makeCtx([makeLeaveDay(docId, '2026-04-14', 'regular')]);
    expect(isDoctorOnLeave(ctx, docId, date)).toBe(false);
  });
});

describe('canDoctorWork — no_bridge regression', () => {
  it('allows assignment when only a no_bridge row exists for that date', () => {
    const docId = 'doc-1';
    const date = new Date(2026, 3, 13);
    const ctx = makeCtx([makeLeaveDay(docId, '2026-04-13', 'no_bridge')]);
    const doctor = makeDoctor(docId);
    expect(canDoctorWork(ctx, doctor, date, 'day')).toBe(true);
  });
});
