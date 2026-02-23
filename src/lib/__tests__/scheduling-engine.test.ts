import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import type { DoctorWithTeam, Team, LeaveDay } from '@/types/scheduling';

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function uid(): string {
  return `id-${++idCounter}`;
}

function makeTeam(id: string, name: string, order: number, color = '#000'): Team {
  return { id, name, color, max_members: 20, order };
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

// ── Test constants for January 2026 ─────────────────────────────────────────
// January 2026: 31 days, 22 working days (weekdays)
// Base norm per doctor (no leave) = 7 × 22 = 154 h
// Target shifts per doctor = ceil(154 / 12) = 13
// With shiftsPerDay=3, shiftsPerNight=3 → 31 × 6 = 186 total shifts = 2232 h
//
// Key insight: due to shift quantization (12h chunks), the number of doctors
// that can ALL meet the 154h norm depends on total slots:
//   14 doctors × 13 shifts = 182 ≤ 186 → all meet norm ✓
//   15 doctors × 13 shifts = 195 > 186 → 9 doctors get only 12 shifts (144h < 154h) ✗
//
// With 15 doctors: max possible leave days = floor((2310 - 2232) / 7) = 11
// With ≥9 leave days spread across doctors, all 15 can meet their reduced norms.

const TEST_MONTH = 0; // January (0-indexed)
const TEST_YEAR = 2026;
const SHIFTS_PER_DAY = 3;
const SHIFTS_PER_NIGHT = 3;
const WORKING_DAYS = 22;
const BASE_NORM = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * WORKING_DAYS; // 154

// Find working days in January 2026 for leave-day placement
function getWorkingDates(): string[] {
  const dates: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const d = new Date(TEST_YEAR, TEST_MONTH, day);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(formatDate(TEST_YEAR, TEST_MONTH, day));
    }
  }
  return dates;
}

// ── Factory for standard team/doctor setups ─────────────────────────────────

function createTeamsAndDoctors(
  teamSizes: number[],
  floatingCount: number,
): { teams: Team[]; doctors: DoctorWithTeam[] } {
  const teams: Team[] = teamSizes.map((_, i) =>
    makeTeam(`team-${i + 1}`, `Team ${i + 1}`, i + 1),
  );
  const doctors: DoctorWithTeam[] = [];
  let docIdx = 1;

  for (let t = 0; t < teams.length; t++) {
    for (let d = 0; d < teamSizes[t]; d++) {
      doctors.push(
        makeDoctor(`doc-${docIdx}`, `Doctor ${docIdx}`, teams[t].id, false, teams[t]),
      );
      docIdx++;
    }
  }

  for (let f = 0; f < floatingCount; f++) {
    doctors.push(
      makeDoctor(`doc-${docIdx}`, `Doctor ${docIdx}`, undefined, true),
    );
    docIdx++;
  }

  return { teams, doctors };
}

function generate(
  teams: Team[],
  doctors: DoctorWithTeam[],
  leaveDays: LeaveDay[] = [],
) {
  const engine = new SchedulingEngine({
    month: TEST_MONTH,
    year: TEST_YEAR,
    doctors,
    teams,
    shiftsPerDay: SHIFTS_PER_DAY,
    shiftsPerNight: SHIFTS_PER_NIGHT,
    leaveDays,
  });
  return engine.generateSchedule();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('SchedulingEngine', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  // ── 1. Team compositions (14 doctors → all meet norm) ─────────────────────
  // 14 doctors × 13 shifts = 182 ≤ 186 slots → every doctor gets ≥13 shifts → 0 warnings

  describe('Team compositions', () => {
    it('single team of 14 doctors, no floating, no leave', () => {
      const { teams, doctors } = createTeamsAndDoctors([14], 0);
      const result = generate(teams, doctors);

      expect(result.shifts.length).toBeGreaterThan(0);
      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }
    });

    it('2 teams of 7 doctors each, no floating, no leave', () => {
      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const result = generate(teams, doctors);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }
    });

    it('7 teams of 2 doctors each, no floating, no leave', () => {
      const { teams, doctors } = createTeamsAndDoctors([2, 2, 2, 2, 2, 2, 2], 0);
      const result = generate(teams, doctors);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }
    });
  });

  // ── 2. With floating doctors (14 total → all meet norm) ───────────────────

  describe('With floating doctors', () => {
    it('2 teams of 5 + 4 floating doctors, no leave', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5], 4);
      expect(doctors).toHaveLength(14);
      const result = generate(teams, doctors);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }

      // Floating doctors should have been assigned shifts
      const floatingDoctorIds = doctors
        .filter(d => d.is_floating)
        .map(d => d.id);
      for (const fid of floatingDoctorIds) {
        const stat = result.doctorStats.find(s => s.doctorId === fid);
        expect(stat).toBeDefined();
        expect(stat!.totalShifts).toBeGreaterThan(0);
      }
    });

    it('3 teams of 3 + 4 floating doctors, no leave', () => {
      const { teams, doctors } = createTeamsAndDoctors([3, 3, 3], 4);
      expect(doctors).toHaveLength(13);
      const result = generate(teams, doctors);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }
    });
  });

  // ── 3. With leave days ────────────────────────────────────────────────────
  // Uses 15 doctors. With no/few leave days, norm warnings are expected for
  // some doctors due to shift quantization (195 target shifts > 186 slots).
  // The tests verify that leave-day norms are correctly computed and that
  // with max leave days, all norms are met.

  describe('With leave days', () => {
    it('one doctor has 1 leave day — that doctor meets reduced norm', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();
      const targetDoctor = doctors[0];

      const leaveDays = [makeLeaveDay(targetDoctor.id, workingDates[5])];
      const result = generate(teams, doctors, leaveDays);

      // Verify the leave doctor's norm is correctly reduced
      const targetStat = result.doctorStats.find(
        s => s.doctorId === targetDoctor.id,
      )!;
      const expectedNorm = BASE_NORM - SCHEDULING_CONSTANTS.SHIFT_DURATION; // 154 - 12 = 142
      expect(targetStat.baseNorm).toBe(expectedNorm);
      // Doctor with leave needs 12 shifts (ceil(142/12)=12, 144h ≥ 142h)
      expect(targetStat.totalHours).toBeGreaterThanOrEqual(expectedNorm);
    });

    it('one doctor has 3 leave days — that doctor meets reduced norm', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();
      const targetDoctor = doctors[0];

      const leaveDays = [
        makeLeaveDay(targetDoctor.id, workingDates[3]),
        makeLeaveDay(targetDoctor.id, workingDates[4]),
        makeLeaveDay(targetDoctor.id, workingDates[5]),
      ];
      const result = generate(teams, doctors, leaveDays);

      const targetStat = result.doctorStats.find(
        s => s.doctorId === targetDoctor.id,
      )!;
      const expectedNorm = BASE_NORM - SCHEDULING_CONSTANTS.SHIFT_DURATION * 3; // 154 - 36 = 118
      expect(targetStat.baseNorm).toBe(expectedNorm);
      expect(targetStat.totalHours).toBeGreaterThanOrEqual(expectedNorm);
    });

    it('multiple doctors have leave days — each meets their reduced norm', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();

      // 3 different doctors, each with 2 leave days = 6 total
      const leaveDays = [
        makeLeaveDay(doctors[0].id, workingDates[2]),
        makeLeaveDay(doctors[0].id, workingDates[3]),
        makeLeaveDay(doctors[5].id, workingDates[8]),
        makeLeaveDay(doctors[5].id, workingDates[9]),
        makeLeaveDay(doctors[10].id, workingDates[14]),
        makeLeaveDay(doctors[10].id, workingDates[15]),
      ];

      const result = generate(teams, doctors, leaveDays);

      // Each doctor with leave should meet their reduced norm
      const doctorsWithLeave = [doctors[0].id, doctors[5].id, doctors[10].id];
      for (const stat of result.doctorStats) {
        if (doctorsWithLeave.includes(stat.doctorId)) {
          const expectedNorm = BASE_NORM - SCHEDULING_CONSTANTS.SHIFT_DURATION * 2;
          expect(stat.baseNorm).toBe(expectedNorm);
          expect(stat.totalHours).toBeGreaterThanOrEqual(expectedNorm);
        }
      }
    });

    it('maximum possible leave days — all doctors meet norm, zero warnings', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();

      const maxLeave = SchedulingEngine.calculatePossibleLeaveDays(
        TEST_MONTH,
        TEST_YEAR,
        doctors.length,
        SHIFTS_PER_DAY,
        SHIFTS_PER_NIGHT,
      );
      expect(maxLeave).toBe(11);

      // Distribute 11 leave days: 2 each for 5 doctors + 1 for a 6th
      const leaveDays: LeaveDay[] = [];
      let leaveIdx = 0;
      for (let d = 0; d < 5; d++) {
        leaveDays.push(
          makeLeaveDay(doctors[d].id, workingDates[leaveIdx++]),
          makeLeaveDay(doctors[d].id, workingDates[leaveIdx++]),
        );
      }
      leaveDays.push(makeLeaveDay(doctors[5].id, workingDates[leaveIdx]));

      expect(leaveDays).toHaveLength(11);

      const result = generate(teams, doctors, leaveDays);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(stat.baseNorm);
      }
    });

    it('no leave days with 14 doctors — all meet norm', () => {
      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      expect(doctors).toHaveLength(14);
      const result = generate(teams, doctors, []);

      expect(result.warnings).toHaveLength(0);

      for (const stat of result.doctorStats) {
        expect(stat.totalHours).toBeGreaterThanOrEqual(BASE_NORM);
      }
    });
  });

  // ── 4. Norm shortfall with too many doctors and no leave ──────────────────
  // With 15+ doctors and no leave, there aren't enough slots for all doctors
  // to reach 13 shifts each → the engine correctly warns about norm shortfall.

  describe('Norm shortfall (15+ doctors, not enough leave days)', () => {
    it('15 doctors, no leave — engine warns about norm shortfall', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      expect(doctors).toHaveLength(15);

      const result = generate(teams, doctors);

      // 15 × 13 = 195 target shifts > 186 available → 9 doctors stuck at 12 shifts
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some(w => w.includes('scheduling.engine.normWarning')),
      ).toBe(true);
      // Exactly 9 doctors should have warnings (195 - 186 = 9)
      expect(result.warnings).toHaveLength(9);
    });

    it('15 doctors with few leave days — fewer warnings than without', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();

      // 3 leave days reduce 3 doctors' targets from 13→12, saving 3 slots
      const leaveDays = [
        makeLeaveDay(doctors[0].id, workingDates[2]),
        makeLeaveDay(doctors[1].id, workingDates[4]),
        makeLeaveDay(doctors[2].id, workingDates[6]),
      ];

      const result = generate(teams, doctors, leaveDays);

      const normWarnings = result.warnings.filter(w =>
        w.includes('scheduling.engine.normWarning'),
      );
      // Should have fewer warnings than the 9 we get with no leave
      expect(normWarnings.length).toBeLessThan(9);
      expect(normWarnings.length).toBeGreaterThan(0);
    });

    it('20 doctors, no leave — many norm warnings', () => {
      const { teams, doctors } = createTeamsAndDoctors([5, 5, 5, 5], 0);
      expect(doctors).toHaveLength(20);

      const result = generate(teams, doctors);

      // 186 slots / 20 doctors ≈ 9.3 shifts each → most get 9 (108h) or 10 (120h)
      // All need 13 shifts (154h) → massive shortfall
      expect(result.warnings.length).toBeGreaterThan(9);
      expect(
        result.warnings.every(w => w.includes('scheduling.engine.normWarning')),
      ).toBe(true);
    });
  });

  // ── 5. Too many leave days warning ────────────────────────────────────────

  describe('Too many leave days warning', () => {
    it('validateLeaveDays returns invalid when exceeding limit', () => {
      const { doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();

      const maxLeave = SchedulingEngine.calculatePossibleLeaveDays(
        TEST_MONTH,
        TEST_YEAR,
        doctors.length,
        SHIFTS_PER_DAY,
        SHIFTS_PER_NIGHT,
      );

      // Create one more leave day than allowed
      const leaveDays: LeaveDay[] = [];
      for (let i = 0; i <= maxLeave; i++) {
        leaveDays.push(
          makeLeaveDay(doctors[i % doctors.length].id, workingDates[i]),
        );
      }

      const validation = SchedulingEngine.validateLeaveDays(
        leaveDays,
        doctors,
        TEST_MONTH,
        TEST_YEAR,
        SHIFTS_PER_DAY,
        SHIFTS_PER_NIGHT,
      );

      expect(validation.isValid).toBe(false);
      expect(validation.message).toContain(
        'scheduling.engine.tooManyLeaveDays',
      );
    });

    it('validateLeaveDays returns valid at exact limit', () => {
      const { doctors } = createTeamsAndDoctors([5, 5, 5], 0);
      const workingDates = getWorkingDates();

      const maxLeave = SchedulingEngine.calculatePossibleLeaveDays(
        TEST_MONTH,
        TEST_YEAR,
        doctors.length,
        SHIFTS_PER_DAY,
        SHIFTS_PER_NIGHT,
      );

      const leaveDays: LeaveDay[] = [];
      for (let i = 0; i < maxLeave; i++) {
        leaveDays.push(
          makeLeaveDay(doctors[i % doctors.length].id, workingDates[i]),
        );
      }

      const validation = SchedulingEngine.validateLeaveDays(
        leaveDays,
        doctors,
        TEST_MONTH,
        TEST_YEAR,
        SHIFTS_PER_DAY,
        SHIFTS_PER_NIGHT,
      );

      expect(validation.isValid).toBe(true);
    });
  });

  // ── Specific scenario: April 2026, 4×3 + 2 floating, 2 doctors with 7 leave days

  describe('April 2026 — 4 teams of 3 + 2 floating, week-long leave', () => {
    // April 2026: 30 days, 22 working days, base norm = 154h
    // 14 doctors total. 180 total shift slots (30 × 6).
    // Doctor 2 and Doctor 3 (team 1) each have 7 leave days (Apr 12–18).
    //   Their norm = 154 - 7×12 = 70h, target = ceil(70/12) = 6 shifts.
    // Other 12 doctors: norm = 154h, target = 13 shifts each.
    // Total target = 12×13 + 2×6 = 168 ≤ 180 slots → all should meet norm.

    const APRIL_MONTH = 3; // 0-indexed
    const APRIL_YEAR = 2026;
    const APRIL_BASE_NORM = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * 22; // 154

    function generateApril(
      teams: Team[],
      doctors: DoctorWithTeam[],
      leaveDays: LeaveDay[] = [],
    ) {
      const engine = new SchedulingEngine({
        month: APRIL_MONTH,
        year: APRIL_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        leaveDays,
      });
      return engine.generateSchedule();
    }

    it('Doctor 2 and Doctor 3 from team 1 have 7 leave days each (Apr 12–18) — all doctors meet min norm', () => {
      const { teams, doctors } = createTeamsAndDoctors([3, 3, 3, 3], 2);
      expect(doctors).toHaveLength(14);

      // Doctor 2 = doctors[1], Doctor 3 = doctors[2] (both in team 1)
      const doc2 = doctors[1];
      const doc3 = doctors[2];
      expect(doc2.team_id).toBe(teams[0].id);
      expect(doc3.team_id).toBe(teams[0].id);

      // Leave days: April 12–18 (Sun 12, Mon 13, Tue 14, Wed 15, Thu 16, Fri 17, Sat 18)
      const leaveDays: LeaveDay[] = [];
      for (let day = 12; day <= 18; day++) {
        leaveDays.push(makeLeaveDay(doc2.id, formatDate(APRIL_YEAR, APRIL_MONTH, day)));
        leaveDays.push(makeLeaveDay(doc3.id, formatDate(APRIL_YEAR, APRIL_MONTH, day)));
      }
      expect(leaveDays).toHaveLength(14);

      const result = generateApril(teams, doctors, leaveDays);

      // Verify schedule was generated
      expect(result.shifts.length).toBeGreaterThan(0);

      // No norm warnings — all doctors should meet their base norm
      expect(result.warnings).toHaveLength(0);

      // Verify leave doctors have correctly reduced norms
      const expectedLeaveNorm = APRIL_BASE_NORM - SCHEDULING_CONSTANTS.SHIFT_DURATION * 7; // 154 - 84 = 70
      for (const docId of [doc2.id, doc3.id]) {
        const stat = result.doctorStats.find(s => s.doctorId === docId)!;
        expect(stat.baseNorm).toBe(expectedLeaveNorm);
        expect(stat.totalHours).toBeGreaterThanOrEqual(expectedLeaveNorm);
        expect(stat.leaveDays).toBe(7);
      }

      // Verify all other doctors meet the full 154h norm
      const leaveDocIds = new Set([doc2.id, doc3.id]);
      for (const stat of result.doctorStats) {
        if (!leaveDocIds.has(stat.doctorId)) {
          expect(stat.baseNorm).toBe(APRIL_BASE_NORM);
          expect(stat.totalHours).toBeGreaterThanOrEqual(APRIL_BASE_NORM);
        }
      }

      // No rest violations
      const restViolations = result.conflicts.filter(c => c.type === 'rest_violation');
      expect(restViolations).toHaveLength(0);

      // Leave doctors should have no shifts during Apr 12–18
      for (const docId of [doc2.id, doc3.id]) {
        const shiftsInLeaveWeek = result.shifts.filter(s => {
          if (s.doctor_id !== docId) return false;
          const day = parseInt(s.shift_date.split('-')[2]);
          return day >= 12 && day <= 18;
        });
        expect(shiftsInLeaveWeek).toHaveLength(0);
      }
    });
  });

  // ── 6. Rest period and conflict detection ─────────────────────────────────

  describe('Rest period and conflict detection', () => {
    it('no rest violations in generated schedule', () => {
      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const result = generate(teams, doctors);

      const restViolations = result.conflicts.filter(
        c => c.type === 'rest_violation',
      );
      expect(restViolations).toHaveLength(0);
    });

    it('understaffed detection when too few doctors', () => {
      const { teams, doctors } = createTeamsAndDoctors([3, 3], 0);
      expect(doctors).toHaveLength(6);

      const result = generate(teams, doctors);

      const understaffed = result.conflicts.filter(
        c => c.type === 'understaffed',
      );
      expect(understaffed.length).toBeGreaterThan(0);
    });
  });
});
