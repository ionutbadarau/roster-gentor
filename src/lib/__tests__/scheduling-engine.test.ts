import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingEngine, SCHEDULING_CONSTANTS } from '@/lib/scheduling-engine';
import type { DoctorWithTeam, Team, LeaveDay, NationalHoliday } from '@/types/scheduling';

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

function makeHoliday(date: string, description = ''): NationalHoliday {
  return { id: uid(), holiday_date: date, description };
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

      // Distribute 11 leave days: 2 each for 5 doctors + 1 for a 6th.
      // Skip index 6 (Fri Jan 9) to avoid a Fri+Mon bridge-day pair for Doctor 3
      // which would reduce their available days via the bridge-day logic.
      const safeIndices = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
      const leaveDays: LeaveDay[] = [];
      let leaveIdx = 0;
      for (let d = 0; d < 5; d++) {
        leaveDays.push(
          makeLeaveDay(doctors[d].id, workingDates[safeIndices[leaveIdx++]]),
          makeLeaveDay(doctors[d].id, workingDates[safeIndices[leaveIdx++]]),
        );
      }
      leaveDays.push(makeLeaveDay(doctors[5].id, workingDates[safeIndices[leaveIdx]]));

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

  // ── 7. National holidays ──────────────────────────────────────────────────
  // January 2026 calendar reference:
  //   Thu 1, Fri 2, [Sat 3, Sun 4], Mon 5, Tue 6, Wed 7, Thu 8, Fri 9,
  //   [Sat 10, Sun 11], Mon 12, Tue 13, Wed 14, Thu 15, Fri 16, ...

  describe('National holidays', () => {
    it('holidays on weekdays reduce working days and base norm for all doctors', () => {
      // Jan 7 (Wed) and Jan 8 (Thu) are holidays → 22 - 2 = 20 working days
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 7)),
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 8)),
      ];

      const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(
        TEST_MONTH, TEST_YEAR, holidays,
      );
      expect(workingDays).toBe(WORKING_DAYS - 2); // 20

      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const engine = new SchedulingEngine({
        month: TEST_MONTH,
        year: TEST_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        nationalHolidays: holidays,
      });
      const result = engine.generateSchedule();

      // All doctors should have the reduced base norm (7 × 20 = 140h)
      const expectedNorm = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * 20;
      for (const stat of result.doctorStats) {
        expect(stat.baseNorm).toBe(expectedNorm);
      }
    });

    it('holidays on weekends do not reduce working days', () => {
      // Jan 3 (Sat) is already a weekend — marking it as holiday changes nothing
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 3)),
      ];

      const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(
        TEST_MONTH, TEST_YEAR, holidays,
      );
      expect(workingDays).toBe(WORKING_DAYS); // still 22
    });

    it('doctors are still scheduled on holidays (holidays reduce norm, not slots)', () => {
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 7)), // Wed
      ];

      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const engine = new SchedulingEngine({
        month: TEST_MONTH,
        year: TEST_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        nationalHolidays: holidays,
      });
      const result = engine.generateSchedule();

      // Shifts should still exist on Jan 7 — holidays reduce norm but don't block scheduling
      const holidayShifts = result.shifts.filter(
        s => s.shift_date === formatDate(TEST_YEAR, TEST_MONTH, 7),
      );
      expect(holidayShifts.length).toBeGreaterThan(0);
    });

    it('calculatePossibleLeaveDays accounts for holidays', () => {
      // 2 holidays on weekdays → 20 working days → lower norm → fewer excess hours
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 7)),
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 8)),
      ];

      const withoutHolidays = SchedulingEngine.calculatePossibleLeaveDays(
        TEST_MONTH, TEST_YEAR, 15, SHIFTS_PER_DAY, SHIFTS_PER_NIGHT,
      );
      const withHolidays = SchedulingEngine.calculatePossibleLeaveDays(
        TEST_MONTH, TEST_YEAR, 15, SHIFTS_PER_DAY, SHIFTS_PER_NIGHT, holidays,
      );

      // Fewer working days → lower total capacity → fewer possible leave days
      expect(withHolidays).toBeLessThan(withoutHolidays);
    });
  });

  // ── 8. Bridge days ────────────────────────────────────────────────────────

  describe('Bridge days', () => {
    // January 2026: Fri 9, [Sat 10, Sun 11], Mon 12
    // Leave on Fri 9 + Mon 12 → Sat 10 & Sun 11 are bridge days

    it('weekend between two leave days is detected as bridge days', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 9)),  // Fri
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 12)), // Mon
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR,
      );

      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 10))).toBe(true); // Sat
      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 11))).toBe(true); // Sun
      expect(bridgeDays.size).toBe(2);
    });

    it('no bridge days when leave days are not adjacent to weekends', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave on Tue 6 and Wed 7 — no weekend in between
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 6)),
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 7)),
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR,
      );

      expect(bridgeDays.size).toBe(0);
    });

    it('no bridge days when only one side of weekend has leave', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave only on Fri 9 — weekend follows but no leave on Mon 12
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 9)),
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR,
      );

      expect(bridgeDays.size).toBe(0);
    });

    it('national holiday between two leave days is detected as bridge day', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave on Tue 6 and Thu 8, holiday on Wed 7
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 7)), // Wed
      ];
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 6)),  // Tue
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 8)),  // Thu
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR, holidays,
      );

      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 7))).toBe(true);
      expect(bridgeDays.size).toBe(1);
    });

    it('holiday + weekend combined as bridge between leave days', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave on Thu 8 and Mon 12. Fri 9 is holiday, Sat 10 / Sun 11 are weekend.
      // All three (Fri 9, Sat 10, Sun 11) should be bridge days.
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 9)), // Fri
      ];
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 8)),  // Thu
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 12)), // Mon
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR, holidays,
      );

      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 9))).toBe(true);  // Fri holiday
      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 10))).toBe(true); // Sat
      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 11))).toBe(true); // Sun
      expect(bridgeDays.size).toBe(3);
    });

    it('bridge days only apply to the doctor who has leave, not others', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc1 = doctors[0];
      const doc2 = doctors[1];

      // Only doc1 has leave on Fri 9 + Mon 12
      const leaveDays = [
        makeLeaveDay(doc1.id, formatDate(TEST_YEAR, TEST_MONTH, 9)),
        makeLeaveDay(doc1.id, formatDate(TEST_YEAR, TEST_MONTH, 12)),
      ];

      const bridgeDoc1 = SchedulingEngine.computeDoctorBridgeDays(
        doc1.id, leaveDays, TEST_MONTH, TEST_YEAR,
      );
      const bridgeDoc2 = SchedulingEngine.computeDoctorBridgeDays(
        doc2.id, leaveDays, TEST_MONTH, TEST_YEAR,
      );

      expect(bridgeDoc1.size).toBe(2); // Sat 10, Sun 11
      expect(bridgeDoc2.size).toBe(0); // no leave → no bridge days
    });

    it('bridge days block scheduling for the affected doctor', () => {
      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave on Fri 9 + Mon 12 → bridge on Sat 10, Sun 11
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 9)),
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 12)),
      ];

      const engine = new SchedulingEngine({
        month: TEST_MONTH,
        year: TEST_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        leaveDays,
      });
      const result = engine.generateSchedule();

      // Doctor should have no shifts on leave days (Fri 9, Mon 12) or bridge days (Sat 10, Sun 11)
      const blockedDates = [9, 10, 11, 12].map(d => formatDate(TEST_YEAR, TEST_MONTH, d));
      const docShiftsOnBlocked = result.shifts.filter(
        s => s.doctor_id === doc.id && blockedDates.includes(s.shift_date),
      );
      expect(docShiftsOnBlocked).toHaveLength(0);

      // Other doctors CAN work on Sat 10, Sun 11 (bridge only affects doc)
      const othersOnBridge = result.shifts.filter(
        s => s.doctor_id !== doc.id &&
          (s.shift_date === formatDate(TEST_YEAR, TEST_MONTH, 10) ||
           s.shift_date === formatDate(TEST_YEAR, TEST_MONTH, 11)),
      );
      expect(othersOnBridge.length).toBeGreaterThan(0);
    });

    it('bridge days do NOT reduce base norm (only explicit leave days do)', () => {
      const { teams, doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave on Fri 9 + Mon 12 → 2 leave days, 2 bridge days
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 9)),
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 12)),
      ];

      const engine = new SchedulingEngine({
        month: TEST_MONTH,
        year: TEST_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        leaveDays,
      });
      const result = engine.generateSchedule();

      const stat = result.doctorStats.find(s => s.doctorId === doc.id)!;
      // Norm reduced by 2 leave days only (not 4 including bridge days)
      const expectedNorm = BASE_NORM - SCHEDULING_CONSTANTS.SHIFT_DURATION * 2; // 154 - 24 = 130
      expect(stat.baseNorm).toBe(expectedNorm);
      expect(stat.leaveDays).toBe(2);
    });

    it('March 2026 — 4×3 + 2 floating, holidays on 5th & 11th, leave for doc5 (9–13) and doc14 (16–20) — no understaffed days', () => {
      // March 2026: 31 days, Sun 1 … Tue 31
      // Weekends: 1,7,8,14,15,21,22,28,29  → 22 weekdays − 2 holidays = 20 working days
      // 14 doctors, 3 per day/night shift → 31 × 6 = 186 total slots
      const MARCH_MONTH = 2; // 0-indexed
      const MARCH_YEAR = 2026;

      const { teams, doctors } = createTeamsAndDoctors([3, 3, 3, 3], 2);
      expect(doctors).toHaveLength(14);

      // Doctor 2 from team 2 = doctors[4] (team1: 0-2, team2: 3-5)
      const doc5 = doctors[4];
      expect(doc5.team_id).toBe(teams[1].id);

      // Last floating doctor = doctors[13]
      const doc14 = doctors[13];
      expect(doc14.is_floating).toBe(true);

      const holidays: NationalHoliday[] = [
        makeHoliday(formatDate(MARCH_YEAR, MARCH_MONTH, 5)),  // Thu
        makeHoliday(formatDate(MARCH_YEAR, MARCH_MONTH, 11)), // Wed
      ];

      // Doc5 leave: 9 (Mon), 10 (Tue), 12 (Thu), 13 (Fri) — skip 11 (holiday)
      // Day 11 becomes a bridge day (holiday between leave days 10 and 12)
      const leaveDays: LeaveDay[] = [
        makeLeaveDay(doc5.id, formatDate(MARCH_YEAR, MARCH_MONTH, 9)),
        makeLeaveDay(doc5.id, formatDate(MARCH_YEAR, MARCH_MONTH, 10)),
        makeLeaveDay(doc5.id, formatDate(MARCH_YEAR, MARCH_MONTH, 12)),
        makeLeaveDay(doc5.id, formatDate(MARCH_YEAR, MARCH_MONTH, 13)),
      ];

      // Doc14 leave: 16 (Mon) through 20 (Fri)
      for (let day = 16; day <= 20; day++) {
        leaveDays.push(makeLeaveDay(doc14.id, formatDate(MARCH_YEAR, MARCH_MONTH, day)));
      }

      // Verify bridge day is correctly computed for doc5
      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc5.id, leaveDays, MARCH_MONTH, MARCH_YEAR, holidays,
      );
      expect(bridgeDays.has(formatDate(MARCH_YEAR, MARCH_MONTH, 11))).toBe(true);
      expect(bridgeDays.size).toBe(1);

      // Generate schedule
      const engine = new SchedulingEngine({
        month: MARCH_MONTH,
        year: MARCH_YEAR,
        doctors,
        teams,
        shiftsPerDay: SHIFTS_PER_DAY,
        shiftsPerNight: SHIFTS_PER_NIGHT,
        leaveDays,
        nationalHolidays: holidays,
      });
      const result = engine.generateSchedule();

      // No rest violations
      const restViolations = result.conflicts.filter(c => c.type === 'rest_violation');
      expect(restViolations).toHaveLength(0);

      // No understaffed days — every day must have ≥3 day shifts and ≥3 night shifts
      const understaffed = result.conflicts.filter(c => c.type === 'understaffed');
      expect(understaffed).toHaveLength(0);

      // Verify doc5 has no shifts on leave days or bridge day
      const doc5BlockedDates = [9, 10, 11, 12, 13].map(d => formatDate(MARCH_YEAR, MARCH_MONTH, d));
      const doc5ShiftsOnBlocked = result.shifts.filter(
        s => s.doctor_id === doc5.id && doc5BlockedDates.includes(s.shift_date),
      );
      expect(doc5ShiftsOnBlocked).toHaveLength(0);

      // Verify doc14 has no shifts during leave week
      const doc14LeaveDates = [16, 17, 18, 19, 20].map(d => formatDate(MARCH_YEAR, MARCH_MONTH, d));
      const doc14ShiftsOnLeave = result.shifts.filter(
        s => s.doctor_id === doc14.id && doc14LeaveDates.includes(s.shift_date),
      );
      expect(doc14ShiftsOnLeave).toHaveLength(0);

      // Every day should have exactly 3 day + 3 night shifts
      for (let day = 1; day <= 31; day++) {
        const dateStr = formatDate(MARCH_YEAR, MARCH_MONTH, day);
        const dayShifts = result.shifts.filter(s => s.shift_date === dateStr && s.shift_type === 'day');
        const nightShifts = result.shifts.filter(s => s.shift_date === dateStr && s.shift_type === 'night');
        expect(dayShifts.length).toBeGreaterThanOrEqual(SHIFTS_PER_DAY);
        expect(nightShifts.length).toBeGreaterThanOrEqual(SHIFTS_PER_NIGHT);
      }
    });

    it('extended bridge: leave Fri + holiday Mon + leave Tue → Mon is bridge', () => {
      const { doctors } = createTeamsAndDoctors([7, 7], 0);
      const doc = doctors[0];

      // Leave Fri 2, holiday Mon 5, leave Tue 6
      // Sat 3, Sun 4 are weekend, Mon 5 is holiday → all between leave Fri 2 and leave Tue 6
      const holidays = [
        makeHoliday(formatDate(TEST_YEAR, TEST_MONTH, 5)), // Mon
      ];
      const leaveDays = [
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 2)),  // Fri
        makeLeaveDay(doc.id, formatDate(TEST_YEAR, TEST_MONTH, 6)),  // Tue
      ];

      const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(
        doc.id, leaveDays, TEST_MONTH, TEST_YEAR, holidays,
      );

      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 3))).toBe(true);  // Sat
      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 4))).toBe(true);  // Sun
      expect(bridgeDays.has(formatDate(TEST_YEAR, TEST_MONTH, 5))).toBe(true);  // Mon holiday
      expect(bridgeDays.size).toBe(3);
    });
  });
});
