import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import type { DoctorWithTeam, Team, LeaveDay, Shift } from '@/types/scheduling';

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function uid(): string {
  return `id-${++idCounter}`;
}

function makeTeam(id: string, name: string, order: number, color = '#000'): Team {
  return { id, name, color, order };
}

function makeDoctor(
  id: string,
  name: string,
  teamId?: string,
  isFloating = false,
  team?: Team,
): DoctorWithTeam {
  return {
    id,
    name,
    team_id: teamId,
    is_floating: isFloating,
    preferences: {},
    team,
  };
}

function makeLeaveDay(doctorId: string, date: string): LeaveDay {
  return { id: uid(), doctor_id: doctorId, leave_date: date };
}

function formatDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// ── Real-world scenario: March 2026 ─────────────────────────────────────────

describe('SchedulingEngine — Cadence-first algorithm', () => {
  beforeEach(() => { idCounter = 0; });
  const MARCH = 2; // 0-indexed
  const YEAR = 2026;

  const teamBlue   = makeTeam('tb', 'Blue',   1, '#00f');
  const teamRed    = makeTeam('tr', 'Red',    2, '#f00');
  const teamGreen  = makeTeam('tg', 'Green',  3, '#0f0');
  const teamYellow = makeTeam('ty', 'Yellow', 4, '#ff0');
  const allTeams = [teamBlue, teamRed, teamGreen, teamYellow];

  // 12 team doctors (12h mode, default)
  const teamDoctors: DoctorWithTeam[] = [
    makeDoctor('d1',  'doctor 1',  'tb', false, teamBlue),
    makeDoctor('d2',  'doctor 2',  'tb', false, teamBlue),
    makeDoctor('d3',  'doctor 3',  'tb', false, teamBlue),
    makeDoctor('d4',  'doctor 4',  'tr', false, teamRed),
    makeDoctor('d5',  'doctor 5',  'tr', false, teamRed),
    makeDoctor('d6',  'dr 6',      'tr', false, teamRed),
    makeDoctor('d7',  'dr 7',      'tg', false, teamGreen),
    makeDoctor('d8',  'dr 8',      'tg', false, teamGreen),
    makeDoctor('d9',  'dr 9',      'tg', false, teamGreen),
    makeDoctor('d10', 'dr 10',     'ty', false, teamYellow),
    makeDoctor('d11', 'dr 11',     'ty', false, teamYellow),
    makeDoctor('d12', 'dr 12',     'ty', false, teamYellow),
  ];

  // 6 floating doctors with shift_mode '24h'
  const floatingDoctors24h: DoctorWithTeam[] = [
    { ...makeDoctor('df1', 'dr flotant 1', undefined, true), shift_mode: '24h' },
    { ...makeDoctor('df2', 'dr flotant 2', undefined, true), shift_mode: '24h' },
    { ...makeDoctor('df3', 'dr flotant 3', undefined, true), shift_mode: '24h' },
    { ...makeDoctor('df4', 'dr flotant 4', undefined, true), shift_mode: '24h' },
    { ...makeDoctor('df5', 'dr flotant 5', undefined, true), shift_mode: '24h' },
    { ...makeDoctor('df6', 'dr flotant 6', undefined, true), shift_mode: '24h' },
  ];

  const allDoctors = [...teamDoctors, ...floatingDoctors24h];

  const leaveDays: LeaveDay[] = [
    // doctor 1: Mar 1 (1 day)
    ...([1] as number[]).map(d => makeLeaveDay('d1', formatDate(YEAR, MARCH, d))),
    // doctor 2: Mar 1–8 (8 days)
    ...([1, 2, 3, 4, 5, 6, 7, 8] as number[]).map(d => makeLeaveDay('d2', formatDate(YEAR, MARCH, d))),
    // doctor 3: Mar 6 - 9 (4 days)
    ...[6, 7, 8, 9].map(d => makeLeaveDay('d3', formatDate(YEAR, MARCH, d))),
    // doctor 5: Mar 12–21 (10 days)
    ...([12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as number[]).map(d => makeLeaveDay('d5', formatDate(YEAR, MARCH, d))),
    // dr 6: Mar 8–13 (6 days)
    ...([8, 9, 10, 11, 12, 13] as number[]).map(d => makeLeaveDay('d6', formatDate(YEAR, MARCH, d))),
    // dr 8: Mar 5–7, 12–14 (6 days)
    ...([5, 6, 7, 12, 13, 14] as number[]).map(d => makeLeaveDay('d8', formatDate(YEAR, MARCH, d))),
    // dr 10: Mar 3-9, 15 (8 days)
    ...([3, 4, 5, 6, 7, 8, 9, 15] as number[]).map(d => makeLeaveDay('d10', formatDate(YEAR, MARCH, d))),
    // dr 11: Mar 23–27 (5 days)
    ...([23, 24, 25, 26, 27] as number[]).map(d => makeLeaveDay('d11', formatDate(YEAR, MARCH, d))),
    // dr flotant 1: Mar 3, 12, 18 (3 days)
    ...([3, 12, 18] as number[]).map(d => makeLeaveDay('df1', formatDate(YEAR, MARCH, d))),
    // dr flotant 2: Mar 1, 19-22 (5 days)
    ...([1, 19, 20, 21, 22] as number[]).map(d => makeLeaveDay('df2', formatDate(YEAR, MARCH, d))),
    // dr flotant 4: Mar 2-9 (8 days)
    ...([2, 3, 4, 5, 6, 7, 8, 9] as number[]).map(d => makeLeaveDay('df4', formatDate(YEAR, MARCH, d))),
  ];

  function generateV2() {
    const engine = new SchedulingEngine({
      month: MARCH,
      year: YEAR,
      doctors: allDoctors,
      teams: allTeams,
      shiftsPerDay: 4,
      shiftsPerNight: 4,
      leaveDays,
    });
    return engine.generateSchedule();
  }

  /** Get shifts for a specific doctor on a specific day. */
  function shiftsFor(shifts: Shift[], doctorId: string, day: number): Shift[] {
    const dateStr = formatDate(YEAR, MARCH, day);
    return shifts.filter(s => s.doctor_id === doctorId && s.shift_date === dateStr);
  }

  it('Blue team (order 1): doctor 3 should have DAY shift on March 1st', () => {
    const result = generateV2();
    const d3March1 = shiftsFor(result.shifts, 'd3', 1);
    expect(d3March1).toHaveLength(1);
    expect(d3March1[0].shift_type).toBe('day');
  });

  it('Blue team (order 1): doctor 1 on leave March 1, should NOT have a shift', () => {
    const result = generateV2();
    const d1March1 = shiftsFor(result.shifts, 'd1', 1);
    expect(d1March1).toHaveLength(0);
  });

  it('Blue team (order 1): doctor 1 and doctor 3 should have NIGHT shift on March 2nd', () => {
    const result = generateV2();

    // doctor 1: not on leave March 2, should have night
    const d1March2 = shiftsFor(result.shifts, 'd1', 2);
    expect(d1March2).toHaveLength(1);
    expect(d1March2[0].shift_type).toBe('night');

    // doctor 3: not on leave March 2, should have night
    const d3March2 = shiftsFor(result.shifts, 'd3', 2);
    expect(d3March2).toHaveLength(1);
    expect(d3March2[0].shift_type).toBe('night');
  });

  it('Blue team (order 1): doctor 2 on leave March 2, should NOT have a shift', () => {
    const result = generateV2();
    const d2March2 = shiftsFor(result.shifts, 'd2', 2);
    expect(d2March2).toHaveLength(0);
  });

  it('Red team (order 2): cadence is D on March 2, N on March 3', () => {
    const result = generateV2();

    // Red team March 2: sequential offset → Day
    for (const docId of ['d4', 'd5', 'd6']) {
      const shifts = shiftsFor(result.shifts, docId, 2);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('day');
    }

    // Red team March 3: sequential offset → Night
    for (const docId of ['d4', 'd5', 'd6']) {
      const shifts = shiftsFor(result.shifts, docId, 3);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('night');
    }
  });

  it('Green team (order 3): cadence is D on March 3, N on March 4', () => {
    const result = generateV2();

    // Green team March 3: cadence position = (2+2)%4 = 0 → Day
    for (const docId of ['d7', 'd8', 'd9']) {
      const shifts = shiftsFor(result.shifts, docId, 3);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('day');
    }

    // Green team March 4: cadence position = (3+2)%4 = 1 → Night
    for (const docId of ['d7', 'd8', 'd9']) {
      const shifts = shiftsFor(result.shifts, docId, 4);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('night');
    }
  });

  it('Yellow team (order 4): cadence is D on March 4, N on March 5', () => {
    const result = generateV2();

    // dr 10 is on leave Mar 3-9, so only dr 11 and dr 12 work
    // Yellow team March 4: sequential offset → Day
    for (const docId of ['d11', 'd12']) {
      const shifts = shiftsFor(result.shifts, docId, 4);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('day');
    }
    expect(shiftsFor(result.shifts, 'd10', 4)).toHaveLength(0);

    // Yellow team March 5: sequential offset → Night
    for (const docId of ['d11', 'd12']) {
      const shifts = shiftsFor(result.shifts, docId, 5);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe('night');
    }
    expect(shiftsFor(result.shifts, 'd10', 5)).toHaveLength(0);
  });

  it('no shifts on leave days', () => {
    const result = generateV2();
    for (const leave of leaveDays) {
      const docShifts = result.shifts.filter(
        s => s.doctor_id === leave.doctor_id && s.shift_date === leave.leave_date
      );
      expect(docShifts).toHaveLength(0);
    }
  });

  it('all 24h floating doctors get at least 1 shift', () => {
    const result = generateV2();
    for (const doc of floatingDoctors24h) {
      const count = result.shifts.filter(s => s.doctor_id === doc.id).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it('doctor 2: forced-coverage shifts cause at most 2 new rest violations', () => {
    const result = generateV2();
    // Count rest violations caused by forced-coverage shifts specifically
    const d2ForcedShifts = result.shifts.filter(
      s => s.doctor_id === 'd2' && s.is_forced_coverage
    );
    // Each forced shift can cause at most 1 violation (with its neighbor).
    // The algorithm caps gap-fill violations at 2 per doctor.
    expect(d2ForcedShifts.length).toBeLessThanOrEqual(2);
  });

  it('completes without hanging', { timeout: 30_000 }, () => {
    const start = performance.now();
    const result = generateV2();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(30_000);
    expect(result.shifts.length).toBeGreaterThan(0);
  });

  describe('max_doctors_per_shift constraint', () => {
    const teamA = makeTeam('ta', 'TeamA', 1, '#00f');
    const teamB = makeTeam('tb2', 'TeamB', 2, '#f00');

    // TeamA has max_doctors_per_shift = 1, 3 doctors
    const constrainedTeamA = { ...teamA, max_doctors_per_shift: 1 };

    const constrainedDoctors: DoctorWithTeam[] = [
      makeDoctor('ca1', 'A-doc-1', 'ta', false, constrainedTeamA),
      makeDoctor('ca2', 'A-doc-2', 'ta', false, constrainedTeamA),
      makeDoctor('ca3', 'A-doc-3', 'ta', false, constrainedTeamA),
      makeDoctor('cb1', 'B-doc-1', 'tb2', false, teamB),
      makeDoctor('cb2', 'B-doc-2', 'tb2', false, teamB),
      makeDoctor('cb3', 'B-doc-3', 'tb2', false, teamB),
    ];

    function generateConstrained() {
      const engine = new SchedulingEngine({
        month: MARCH,
        year: YEAR,
        doctors: constrainedDoctors,
        teams: [constrainedTeamA, teamB],
        shiftsPerDay: 4,
        shiftsPerNight: 4,
        leaveDays: [],
      });
      return engine.generateSchedule();
    }

    it('at most 1 TeamA doctor per shift type per day', () => {
      const result = generateConstrained();
      const daysInMonth = 31;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(YEAR, MARCH, day);
        for (const shiftType of ['day', 'night'] as const) {
          const teamAShifts = result.shifts.filter(
            s => s.shift_date === dateStr &&
                 s.shift_type === shiftType &&
                 ['ca1', 'ca2', 'ca3'].includes(s.doctor_id)
          );
          expect(teamAShifts.length).toBeLessThanOrEqual(1);
        }
      }
    });

    it('TeamB (unconstrained) can have multiple doctors per shift', () => {
      const result = generateConstrained();
      // On TeamB's cadence day, all 3 doctors should work the same shift type
      // TeamB order=2 → Day on day 2
      const dateStr = formatDate(YEAR, MARCH, 2);
      const teamBDay = result.shifts.filter(
        s => s.shift_date === dateStr &&
             s.shift_type === 'day' &&
             ['cb1', 'cb2', 'cb3'].includes(s.doctor_id)
      );
      expect(teamBDay.length).toBe(3);
    });
  });

  // ── Real-world: 24h doctors in a team with max_doctors_per_shift = 1 ──
  describe('Real-world — 24h doctors in constrained team 5', () => {
    const teamBlue5   = makeTeam('tb', 'Blue',   1, '#00f');
    const teamRed5    = makeTeam('tr', 'Red',    2, '#f00');
    const teamGreen5  = makeTeam('tg', 'Green',  3, '#0f0');
    const teamYellow5 = makeTeam('ty', 'Yellow', 4, '#ff0');
    const team5       = { ...makeTeam('t5', 'Team5', 5, '#888'), max_doctors_per_shift: 1 };
    const allTeams5 = [teamBlue5, teamRed5, teamGreen5, teamYellow5, team5];

    // Same 12 team doctors
    const teamDoctors5: DoctorWithTeam[] = [
      makeDoctor('d1',  'doctor 1',  'tb', false, teamBlue5),
      makeDoctor('d2',  'doctor 2',  'tb', false, teamBlue5),
      makeDoctor('d3',  'doctor 3',  'tb', false, teamBlue5),
      makeDoctor('d4',  'doctor 4',  'tr', false, teamRed5),
      makeDoctor('d5',  'doctor 5',  'tr', false, teamRed5),
      makeDoctor('d6',  'dr 6',      'tr', false, teamRed5),
      makeDoctor('d7',  'dr 7',      'tg', false, teamGreen5),
      makeDoctor('d8',  'dr 8',      'tg', false, teamGreen5),
      makeDoctor('d9',  'dr 9',      'tg', false, teamGreen5),
      makeDoctor('d10', 'dr 10',     'ty', false, teamYellow5),
      makeDoctor('d11', 'dr 11',     'ty', false, teamYellow5),
      makeDoctor('d12', 'dr 12',     'ty', false, teamYellow5),
    ];

    // 6 doctors in team 5 with shift_mode '24h' (NOT floating)
    const team5Doctors24h: DoctorWithTeam[] = [
      { ...makeDoctor('df1', 'dr flotant 1', 't5', false, team5), shift_mode: '24h' },
      { ...makeDoctor('df2', 'dr flotant 2', 't5', false, team5), shift_mode: '24h' },
      { ...makeDoctor('df3', 'dr flotant 3', 't5', false, team5), shift_mode: '24h' },
      { ...makeDoctor('df4', 'dr flotant 4', 't5', false, team5), shift_mode: '24h' },
      { ...makeDoctor('df5', 'dr flotant 5', 't5', false, team5), shift_mode: '24h' },
      { ...makeDoctor('df6', 'dr flotant 6', 't5', false, team5), shift_mode: '24h' },
    ];

    const allDoctors5 = [...teamDoctors5, ...team5Doctors24h];

    // Same leave days as the main test
    const leaveDays5: LeaveDay[] = [
      ...([1] as number[]).map(d => makeLeaveDay('d1', formatDate(YEAR, MARCH, d))),
      ...([1, 2, 3, 4, 5, 6, 7, 8] as number[]).map(d => makeLeaveDay('d2', formatDate(YEAR, MARCH, d))),
      ...[6, 7, 8, 9].map(d => makeLeaveDay('d3', formatDate(YEAR, MARCH, d))),
      ...([12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as number[]).map(d => makeLeaveDay('d5', formatDate(YEAR, MARCH, d))),
      ...([8, 9, 10, 11, 12, 13] as number[]).map(d => makeLeaveDay('d6', formatDate(YEAR, MARCH, d))),
      ...([5, 6, 7, 12, 13, 14] as number[]).map(d => makeLeaveDay('d8', formatDate(YEAR, MARCH, d))),
      ...([3, 4, 5, 6, 7, 8, 9, 15] as number[]).map(d => makeLeaveDay('d10', formatDate(YEAR, MARCH, d))),
      ...([23, 24, 25, 26, 27] as number[]).map(d => makeLeaveDay('d11', formatDate(YEAR, MARCH, d))),
      ...([3, 12, 18] as number[]).map(d => makeLeaveDay('df1', formatDate(YEAR, MARCH, d))),
      ...([1, 19, 20, 21, 22] as number[]).map(d => makeLeaveDay('df2', formatDate(YEAR, MARCH, d))),
      // df3: 5 working-day leave (Mar 2-6, Mon-Fri) → norm drops to 119h
      ...([2, 3, 4, 5, 6] as number[]).map(d => makeLeaveDay('df3', formatDate(YEAR, MARCH, d))),
      ...([2, 3, 4, 5, 6, 7, 8, 9] as number[]).map(d => makeLeaveDay('df4', formatDate(YEAR, MARCH, d))),
      // df5: 5 working-day leave (Mar 16-20, Mon-Fri) → norm drops to 119h
      ...([16, 17, 18, 19, 20] as number[]).map(d => makeLeaveDay('df5', formatDate(YEAR, MARCH, d))),
      // df6: 5 working-day leave (Mar 23-27, Mon-Fri) → norm drops to 119h
      ...([23, 24, 25, 26, 27] as number[]).map(d => makeLeaveDay('df6', formatDate(YEAR, MARCH, d))),
    ];

    function generateWithTeam5() {
      const engine = new SchedulingEngine({
        month: MARCH,
        year: YEAR,
        doctors: allDoctors5,
        teams: allTeams5,
        shiftsPerDay: 4,
        shiftsPerNight: 4,
        leaveDays: leaveDays5,
      });
      return engine.generateSchedule();
    }

    it('at most 1 Team5 (24h) doctor per calendar day', () => {
      const result = generateWithTeam5();
      const team5DocIds = new Set(team5Doctors24h.map(d => d.id));
      const daysInMonth = 31;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(YEAR, MARCH, day);
        const team5Shifts = result.shifts.filter(
          s => s.shift_date === dateStr && team5DocIds.has(s.doctor_id)
        );
        expect(team5Shifts.length, `Day ${day}: ${team5Shifts.length} Team5 doctors`).toBeLessThanOrEqual(1);
      }
    });

    it('no shifts on leave days for team5 doctors', () => {
      const result = generateWithTeam5();
      for (const leave of leaveDays5) {
        const docShifts = result.shifts.filter(
          s => s.doctor_id === leave.doctor_id && s.shift_date === leave.leave_date
        );
        expect(docShifts).toHaveLength(0);
      }
    });

    it('all team5 24h doctors meet base norm', () => {
      const result = generateWithTeam5();
      for (const doc of team5Doctors24h) {
        const stats = result.doctorStats.find(s => s.doctorId === doc.id);
        expect(stats, `${doc.name} missing from doctorStats`).toBeDefined();
        expect(stats!.meetsBaseNorm, `${doc.name}: ${stats!.totalHours}h < ${stats!.baseNorm}h base norm`).toBe(true);
      }
    });
  });

  describe('Real-world — floating 12h doctors with constrained team 5', () => {
    const teamBlue6   = makeTeam('tb', 'Blue',   1, '#00f');
    const teamRed6    = makeTeam('tr', 'Red',    2, '#f00');
    const teamGreen6  = makeTeam('tg', 'Green',  3, '#0f0');
    const teamYellow6 = makeTeam('ty', 'Yellow', 4, '#ff0');
    const team5_6     = { ...makeTeam('t5', 'Team5', 5, '#888'), max_doctors_per_shift: 1 };
    const allTeams6 = [teamBlue6, teamRed6, teamGreen6, teamYellow6, team5_6];

    // Same 12 team doctors
    const teamDoctors6: DoctorWithTeam[] = [
      makeDoctor('d1',  'doctor 1',  'tb', false, teamBlue6),
      makeDoctor('d2',  'doctor 2',  'tb', false, teamBlue6),
      makeDoctor('d3',  'doctor 3',  'tb', false, teamBlue6),
      makeDoctor('d4',  'doctor 4',  'tr', false, teamRed6),
      makeDoctor('d5',  'doctor 5',  'tr', false, teamRed6),
      makeDoctor('d6',  'dr 6',      'tr', false, teamRed6),
      makeDoctor('d7',  'dr 7',      'tg', false, teamGreen6),
      makeDoctor('d8',  'dr 8',      'tg', false, teamGreen6),
      makeDoctor('d9',  'dr 9',      'tg', false, teamGreen6),
      makeDoctor('d10', 'dr 10',     'ty', false, teamYellow6),
      makeDoctor('d11', 'dr 11',     'ty', false, teamYellow6),
      makeDoctor('d12', 'dr 12',     'ty', false, teamYellow6),
    ];

    // df1 and df2 are floating 12h doctors (NOT in team5, NOT 24h)
    const floatingDoctors12h: DoctorWithTeam[] = [
      makeDoctor('df1', 'dr flotant 1', undefined, true),
      makeDoctor('df2', 'dr flotant 2', undefined, true),
    ];

    // df3-df6 remain team5 24h doctors
    const team5Doctors24h6: DoctorWithTeam[] = [
      { ...makeDoctor('df3', 'dr flotant 3', 't5', false, team5_6), shift_mode: '24h' },
      { ...makeDoctor('df4', 'dr flotant 4', 't5', false, team5_6), shift_mode: '24h' },
      { ...makeDoctor('df5', 'dr flotant 5', 't5', false, team5_6), shift_mode: '24h' },
      { ...makeDoctor('df6', 'dr flotant 6', 't5', false, team5_6), shift_mode: '24h' },
    ];

    const allDoctors6 = [...teamDoctors6, ...floatingDoctors12h, ...team5Doctors24h6];

    // Same leave days as the team5 suite
    const leaveDays6: LeaveDay[] = [
      ...([1] as number[]).map(d => makeLeaveDay('d1', formatDate(YEAR, MARCH, d))),
      ...([1, 2, 3, 4, 5, 6, 7, 8] as number[]).map(d => makeLeaveDay('d2', formatDate(YEAR, MARCH, d))),
      ...[6, 7, 8, 9].map(d => makeLeaveDay('d3', formatDate(YEAR, MARCH, d))),
      ...([12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as number[]).map(d => makeLeaveDay('d5', formatDate(YEAR, MARCH, d))),
      ...([8, 9, 10, 11, 12, 13] as number[]).map(d => makeLeaveDay('d6', formatDate(YEAR, MARCH, d))),
      ...([5, 6, 7, 12, 13, 14] as number[]).map(d => makeLeaveDay('d8', formatDate(YEAR, MARCH, d))),
      ...([3, 4, 5, 6, 7, 8, 9, 15] as number[]).map(d => makeLeaveDay('d10', formatDate(YEAR, MARCH, d))),
      ...([23, 24, 25, 26, 27] as number[]).map(d => makeLeaveDay('d11', formatDate(YEAR, MARCH, d))),
      ...([3, 12, 18] as number[]).map(d => makeLeaveDay('df1', formatDate(YEAR, MARCH, d))),
      ...([1, 19, 20, 21, 22] as number[]).map(d => makeLeaveDay('df2', formatDate(YEAR, MARCH, d))),
      ...([2, 3, 4, 5, 6] as number[]).map(d => makeLeaveDay('df3', formatDate(YEAR, MARCH, d))),
      ...([2, 3, 4, 5, 6, 7, 8, 9] as number[]).map(d => makeLeaveDay('df4', formatDate(YEAR, MARCH, d))),
      ...([16, 17, 18, 19, 20] as number[]).map(d => makeLeaveDay('df5', formatDate(YEAR, MARCH, d))),
      ...([23, 24, 25, 26, 27] as number[]).map(d => makeLeaveDay('df6', formatDate(YEAR, MARCH, d))),
    ];

    function generateWithFloating12h() {
      const engine = new SchedulingEngine({
        month: MARCH,
        year: YEAR,
        doctors: allDoctors6,
        teams: allTeams6,
        shiftsPerDay: 4,
        shiftsPerNight: 4,
        leaveDays: leaveDays6,
      });
      return engine.generateSchedule();
    }

    it('all doctors meet base norm', () => {
      const result = generateWithFloating12h();
      const nonOptional = allDoctors6.filter(d => !(d as any).is_optional);
      for (const doc of nonOptional) {
        const stats = result.doctorStats.find(s => s.doctorId === doc.id);
        expect(stats, `${doc.name} missing from doctorStats`).toBeDefined();
        expect(stats!.meetsBaseNorm, `${doc.name}: ${stats!.totalHours}h < ${stats!.baseNorm}h base norm`).toBe(true);
      }
    });
  });
});
