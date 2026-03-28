/**
 * SchedulingEngine V2 — Cadence-First Algorithm
 *
 * Phase 1: Fill cadence shifts strictly (D-N-R-R per team + 24h rigid cadence),
 *          chronologically day 1..N. Skip doctors on leave/bridge.
 * Phase 2: Fill remaining uncovered slots chronologically, using any available
 *          doctor. Allows rest violations if needed to meet minimum staffing.
 *          Sorts candidates by fewest shifts so far (basic fairness).
 *
 * Rest violations are shown in the UI (red markers).
 */

import type { DoctorWithTeam, Shift, LeaveDay, NationalHoliday, ScheduleConflict, ScheduleGenerationResult, Doctor } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS, type ScheduleGenerationOptions, type EngineContext } from '../constants';
import { formatDate, utcMs, getDaysInMonth } from '../calendar-utils';
import { computeAllBridgeDays } from '../bridge-days';
import { isDoctorOnLeave, isDoctorOnBridgeDay } from '../constraints';
import { rebuildCounters, checkDoctorNorms, applyShiftRounding, calculateDoctorStats, recordShift, recordShift24h } from '../stats';
import { createPRNG } from '../prng';
import { detectConflicts } from '../validation';
import { computeTeamCadenceGrid, computeDoctorCadenceSchedule } from '../cadence';


export class SchedulingEngineV2 implements EngineContext {
  doctors: DoctorWithTeam[];
  teams: import('@/types/scheduling').Team[];
  month: number;
  year: number;
  shiftsPerDay: number;
  shiftsPerNight: number;
  leaveDays: LeaveDay[];
  nationalHolidays: NationalHoliday[];
  fixedShifts: Shift[];
  previousMonthShifts: Shift[];
  holidayDateSet: Set<string>;
  doctorBridgeDays: Map<string, Set<string>>;
  doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' | '24h'; endTime: number }> = new Map();
  fixedShiftsByDoctor: Map<string, { startMs: number; shiftType: 'day' | 'night' }[]> = new Map();
  doctorShiftCount: Map<string, number> = new Map();
  doctorHours: Map<string, number> = new Map();
  doctorWeeklyHours: Map<string, Map<number, number>> = new Map();
  scorePerturbation: Map<string, number> = new Map();
  doctorCadence: Map<string, Map<number, 'day' | 'night' | null>> = new Map();
  random: () => number;
  generateId: () => string;
  private idCounter = 0;

  constructor(options: ScheduleGenerationOptions) {
    this.doctors = [...options.doctors].sort((a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name)
    );
    this.teams = options.teams.sort((a, b) => a.order - b.order);
    this.month = options.month;
    this.year = options.year;
    this.shiftsPerDay = options.shiftsPerDay;
    this.shiftsPerNight = options.shiftsPerNight;
    this.leaveDays = options.leaveDays || [];
    this.nationalHolidays = options.nationalHolidays || [];
    this.fixedShifts = options.fixedShifts || [];
    this.previousMonthShifts = options.previousMonthShifts || [];

    for (const fs of this.fixedShifts) {
      if (fs.shift_type !== 'day' && fs.shift_type !== 'night' && fs.shift_type !== '24h') continue;
      const parts = fs.shift_date.split('-').map(Number);
      const startMs = fs.shift_type === 'night'
        ? utcMs(parts[0], parts[1] - 1, parts[2], 20)
        : utcMs(parts[0], parts[1] - 1, parts[2], 8);
      if (!this.fixedShiftsByDoctor.has(fs.doctor_id)) {
        this.fixedShiftsByDoctor.set(fs.doctor_id, []);
      }
      const shiftType = fs.shift_type === '24h' ? 'day' : fs.shift_type;
      this.fixedShiftsByDoctor.get(fs.doctor_id)!.push({ startMs, shiftType });
    }

    this.holidayDateSet = new Set(this.nationalHolidays.map(h => h.holiday_date));
    this.doctorBridgeDays = computeAllBridgeDays(this.doctors, this.leaveDays, this.month, this.year, this.nationalHolidays);

    const seed = options.seed ?? (this.year * 100 + this.month);
    this.random = createPRNG(seed);
    this.generateId = () => `shift-${++this.idCounter}`;
  }

  generateSchedule(): ScheduleGenerationResult {
    const daysInMonth = getDaysInMonth(this.year, this.month);
    const shifts: Shift[] = [];
    const warnings: string[] = [];

    const allDoctors = this.doctors;
    this.doctors = allDoctors.filter(d => !d.is_optional);

    // ── Doctor classification ──
    const doctorsByTeam = new Map<string, DoctorWithTeam[]>();
    const floatingDoctors: DoctorWithTeam[] = [];

    this.teams.forEach(team => {
      doctorsByTeam.set(team.id, []);
    });

    this.doctors.forEach(doctor => {
      if (doctor.shift_mode === '24h') return;
      if (doctor.is_floating) {
        floatingDoctors.push(doctor);
      } else if (doctor.team_id) {
        const teamDoctors = doctorsByTeam.get(doctor.team_id);
        if (teamDoctors) teamDoctors.push(doctor);
      }
    });

    const doctors24h = this.doctors.filter(d => d.shift_mode === '24h');

    // ── Initialise counters ──
    this.doctors.forEach(d => {
      this.doctorShiftCount.set(d.id, 0);
      this.doctorHours.set(d.id, 0);
      this.doctorWeeklyHours.set(d.id, new Map());
    });

    // Seed rest constraints from previous month
    for (const ps of this.previousMonthShifts) {
      if (ps.shift_type !== 'day' && ps.shift_type !== 'night' && ps.shift_type !== '24h') continue;
      const doctor = this.doctors.find(d => d.id === ps.doctor_id);
      if (!doctor) continue;
      const dateParts = ps.shift_date.split('-').map(Number);
      const prevDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const endTime = ps.shift_type === 'day'
        ? utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate(), 20)
        : utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1, 8);
      const shiftType = ps.shift_type as 'day' | 'night' | '24h';
      const existing = this.doctorLastShift.get(doctor.id);
      if (!existing || endTime > existing.endTime) {
        this.doctorLastShift.set(doctor.id, { date: prevDate, type: shiftType, endTime });
      }
    }

    // Build fixed shift lookup
    const fixedShiftsByDateType = new Map<string, Shift[]>();
    for (const fs of this.fixedShifts) {
      if (fs.shift_type === '24h') {
        for (const st of ['day', 'night'] as const) {
          const key = `${fs.shift_date}:${st}`;
          if (!fixedShiftsByDateType.has(key)) fixedShiftsByDateType.set(key, []);
          fixedShiftsByDateType.get(key)!.push(fs);
        }
      } else if (fs.shift_type === 'day' || fs.shift_type === 'night') {
        const key = `${fs.shift_date}:${fs.shift_type}`;
        if (!fixedShiftsByDateType.has(key)) fixedShiftsByDateType.set(key, []);
        fixedShiftsByDateType.get(key)!.push(fs);
      }
    }

    // ── Phase 0: Compute cadence grids ──
    const teamCadence = computeTeamCadenceGrid(this.teams, daysInMonth, { sequential: true });
    this.doctorCadence = computeDoctorCadenceSchedule(this.doctors, teamCadence);

    // ── Phase 1: Fill cadence shifts strictly ──
    // For each day, assign ALL team doctors to their cadence slot (day/night).
    // Only skip doctors on leave or bridge. Cadence takes absolute priority —
    // rest constraints are NOT checked here (D-N-R-R naturally satisfies rest,
    // and cross-month boundary violations are acceptable).
    const assignedByDay = new Map<number, Set<string>>();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = formatDate(currentDate);
      const assigned = new Set<string>();
      assignedByDay.set(day, assigned);

      // Register fixed (manual) shifts
      const fixed24hOnDate = new Set<string>();
      for (const fs of this.fixedShifts) {
        if (fs.shift_date !== dateStr) continue;
        const doctor = this.doctors.find(d => d.id === fs.doctor_id);
        if (!doctor) continue;
        assigned.add(doctor.id);
        if (fs.shift_type === '24h') {
          if (!fixed24hOnDate.has(doctor.id)) {
            fixed24hOnDate.add(doctor.id);
            recordShift24h(this, doctor, currentDate);
          }
        } else if (fs.shift_type === 'day' || fs.shift_type === 'night') {
          recordShift(this, doctor, currentDate, fs.shift_type);
        }
      }

      // Assign cadence shifts for each team
      for (const [teamId, dayMap] of Array.from(teamCadence)) {
        const cadenceType = dayMap.get(day); // 'day', 'night', or null (rest)
        if (!cadenceType) continue;

        const team = this.teams.find(t => t.id === teamId);
        const maxPerShift = team?.max_doctors_per_shift;
        let teamShiftCount = 0;

        const teamDocs = doctorsByTeam.get(teamId) || [];
        for (const doc of teamDocs) {
          if (assigned.has(doc.id)) continue;
          if (isDoctorOnLeave(this, doc.id, currentDate)) continue;
          if (isDoctorOnBridgeDay(this, doc.id, currentDate)) continue;
          if (maxPerShift && teamShiftCount >= maxPerShift) continue;

          shifts.push({
            id: this.generateId(),
            doctor_id: doc.id,
            shift_date: dateStr,
            shift_type: cadenceType,
            start_time: cadenceType === 'day' ? '08:00' : '20:00',
            end_time: cadenceType === 'day' ? '20:00' : '08:00',
          });
          recordShift(this, doc, currentDate, cadenceType);
          assigned.add(doc.id);
          teamShiftCount++;
        }
      }
    }

    // ── Phase 1b: 24h doctor cadence (rigid 72h cycle) ──
    const teamById = new Map(this.teams.map(t => [t.id, t]));
    const restDays24h = Math.ceil(SCHEDULING_CONSTANTS.SHIFT_24H_REST / 24);
    const minGap = restDays24h + 1; // 4

    if (doctors24h.length > 0) {
      const offsets = Array.from({ length: minGap }, (_, i) => i + 1);

      // Per-doctor available days
      const doctorAvailDays = new Map<string, Set<number>>();
      for (const doc of doctors24h) {
        const avail = new Set<number>();
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(this.year, this.month, day);
          if (!isDoctorOnLeave(this, doc.id, date) && !isDoctorOnBridgeDay(this, doc.id, date)) {
            avail.add(day);
          }
        }
        doctorAvailDays.set(doc.id, avail);
      }

      const countShiftsOnOffset = (docId: string, offset: number): number => {
        const avail = doctorAvailDays.get(docId)!;
        let count = 0;
        for (let day = offset; day <= daysInMonth; day += minGap) {
          if (avail.has(day)) count++;
        }
        return count;
      };

      const workDays24h = new Map<string, number[]>();
      for (const doc of doctors24h) workDays24h.set(doc.id, []);

      // Track per-team per-day 24h assignments for max_doctors_per_shift constraint
      const teamDayCount24h = new Map<string, Map<number, number>>(); // teamId → day → count

      const canAssign24h = (doc: DoctorWithTeam, day: number): boolean => {
        const wd = workDays24h.get(doc.id) || [];
        for (const w of wd) {
          if (Math.abs(day - w) <= restDays24h) return false;
        }
        const avail = doctorAvailDays.get(doc.id);
        if (!avail || !avail.has(day)) return false;
        // Enforce max_doctors_per_shift for team doctors
        if (doc.team_id) {
          const team = teamById.get(doc.team_id);
          if (team?.max_doctors_per_shift) {
            const dayMap = teamDayCount24h.get(doc.team_id);
            const count = dayMap?.get(day) || 0;
            if (count >= team.max_doctors_per_shift) return false;
          }
        }
        return true;
      };

      const place24hShift = (doc: DoctorWithTeam, day: number) => {
        const assigned = assignedByDay.get(day)!;
        const dateStr = formatDate(new Date(this.year, this.month, day));
        const currentDate = new Date(this.year, this.month, day);

        shifts.push({
          id: this.generateId(),
          doctor_id: doc.id,
          shift_date: dateStr,
          shift_type: '24h',
          start_time: '08:00',
          end_time: '08:00',
        });
        recordShift24h(this, doc, currentDate);
        assigned.add(doc.id);
        workDays24h.get(doc.id)!.push(day);
        // Track team constraint
        if (doc.team_id) {
          if (!teamDayCount24h.has(doc.team_id)) teamDayCount24h.set(doc.team_id, new Map());
          const dayMap = teamDayCount24h.get(doc.team_id)!;
          dayMap.set(day, (dayMap.get(day) || 0) + 1);
        }
      };

      // Split 24h doctors into constrained (team with max_doctors_per_shift) and unconstrained
      const constrained24hByTeam = new Map<string, DoctorWithTeam[]>();
      const unconstrained24h: DoctorWithTeam[] = [];

      for (const doc of doctors24h) {
        if (doc.team_id) {
          const team = teamById.get(doc.team_id);
          if (team?.max_doctors_per_shift) {
            if (!constrained24hByTeam.has(doc.team_id)) constrained24hByTeam.set(doc.team_id, []);
            constrained24hByTeam.get(doc.team_id)!.push(doc);
            continue;
          }
        }
        unconstrained24h.push(doc);
      }

      // ── Constrained teams: round-robin distribution ──
      // Instead of primary/swing (which gives all days on an offset to one doctor),
      // distribute cadence days across all team doctors by picking the one with
      // fewest shifts on each day. This ensures all doctors get shifts.
      for (const [, teamDocs] of Array.from(constrained24hByTeam)) {
        // Collect all cadence days across all offsets
        const allCadenceDays: number[] = [];
        for (const offset of offsets) {
          for (let day = offset; day <= daysInMonth; day += minGap) {
            allCadenceDays.push(day);
          }
        }
        allCadenceDays.sort((a, b) => a - b);

        for (const day of allCadenceDays) {
          // Find available doctors, sorted by fewest shifts
          const available = teamDocs
            .filter((doc: DoctorWithTeam) => canAssign24h(doc, day))
            .sort((a: DoctorWithTeam, b: DoctorWithTeam) =>
              (workDays24h.get(a.id)?.length || 0) - (workDays24h.get(b.id)?.length || 0)
            );
          if (available.length === 0) continue;
          place24hShift(available[0], day);
        }
      }

      // ── Unconstrained 24h doctors: primary/swing offset assignment ──
      if (unconstrained24h.length > 0) {
        const numPrimary = Math.min(unconstrained24h.length, minGap);
        const permute = (arr: number[]): number[][] => {
          if (arr.length <= 1) return [arr];
          const result: number[][] = [];
          for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const perm of permute(rest)) result.push([arr[i], ...perm]);
          }
          return result;
        };
        const combinations = (items: number[], k: number): number[][] => {
          if (k === 0) return [[]];
          if (items.length < k) return [];
          const result: number[][] = [];
          for (let i = 0; i <= items.length - k; i++) {
            for (const combo of combinations(items.slice(i + 1), k - 1)) result.push([items[i], ...combo]);
          }
          return result;
        };

        const doctorIndices = Array.from({ length: unconstrained24h.length }, (_, i) => i);
        const primaryCombos = combinations(doctorIndices, numPrimary);
        const offsetPerms = permute(offsets);

        let bestAssignment: { docIdx: number; offset: number }[] = [];
        let bestTotalShifts = -1;

        for (const combo of primaryCombos) {
          for (const perm of offsetPerms) {
            let totalShifts = 0;
            for (let i = 0; i < numPrimary; i++) {
              totalShifts += countShiftsOnOffset(unconstrained24h[combo[i]].id, perm[i]);
            }
            if (totalShifts > bestTotalShifts) {
              bestTotalShifts = totalShifts;
              bestAssignment = combo.map((docIdx, i) => ({ docIdx, offset: perm[i] }));
            }
          }
        }

        // Place primary doctors
        const primaryDocIds = new Set<string>();
        for (const { docIdx, offset } of bestAssignment) {
          const doc = unconstrained24h[docIdx];
          primaryDocIds.add(doc.id);
          for (let day = offset; day <= daysInMonth; day += minGap) {
            if (canAssign24h(doc, day)) {
              place24hShift(doc, day);
            }
          }
        }

        // Swing doctors
        const swingDocs = unconstrained24h.filter(d => !primaryDocIds.has(d.id));
        for (const doc of swingDocs) {
          let bestOffset = -1;
          let bestShifts = -1;
          for (const off of offsets) {
            const sc = countShiftsOnOffset(doc.id, off);
            if (sc > bestShifts) { bestShifts = sc; bestOffset = off; }
          }
          if (bestOffset > 0) {
            for (let day = bestOffset; day <= daysInMonth; day += minGap) {
              if (canAssign24h(doc, day)) {
                place24hShift(doc, day);
              }
            }
          }
        }
      }
    }

    // ── Phase 2: Identify uncovered slots ──
    interface UncoveredSlot {
      day: number;
      dateStr: string;
      shiftType: 'day' | 'night';
      needed: number;
    }
    const uncoveredSlots: UncoveredSlot[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDate(new Date(this.year, this.month, day));

      for (const shiftType of ['day', 'night'] as const) {
        const required = shiftType === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
        const fixedCount = fixedShiftsByDateType.get(`${dateStr}:${shiftType}`)?.length || 0;
        const genCount = shifts.filter(s => s.shift_date === dateStr && s.shift_type === shiftType).length;
        const gen24h = shifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
        const total = fixedCount + genCount + gen24h;

        if (total < required) {
          uncoveredSlots.push({ day, dateStr, shiftType, needed: required - total });
        }
      }
    }

    // ── Phase 2b: Fill uncovered slots ──
    // Single pass: fill all gaps using any available doctor (floating + off-cadence).
    // Rest violations are allowed up to MAX_VIOLATIONS_PER_DOCTOR per doctor.
    // Once a doctor has accumulated that many violations, skip them — leave
    // the slot understaffed rather than pile on more violations.
    // Sort candidates by fewest shifts for basic fairness.

    const MAX_VIOLATIONS_PER_DOCTOR = 2;

    rebuildCounters(this, shifts);

    const getShiftCount = (docId: string): number =>
      this.doctorShiftCount.get(docId) || 0;

    // All 12h doctors available for gap-filling (floating + team doctors)
    const gapFillers = [...floatingDoctors];
    for (const [, teamDocs] of Array.from(doctorsByTeam)) {
      gapFillers.push(...teamDocs);
    }

    // Track rest-violation count per doctor during gap-fill
    const doctorViolationCount = new Map<string, number>();

    // Check whether placing a shift would violate rest constraints
    const wouldViolateRest = (docId: string, dateStr: string, shiftType: 'day' | 'night'): boolean => {
      const dp = dateStr.split('-').map(Number);
      const newStartMs = shiftType === 'day'
        ? utcMs(dp[0], dp[1] - 1, dp[2], 8)
        : utcMs(dp[0], dp[1] - 1, dp[2], 20);
      const newEndMs = shiftType === 'day'
        ? utcMs(dp[0], dp[1] - 1, dp[2], 20)
        : utcMs(dp[0], dp[1] - 1, dp[2] + 1, 8);

      const allShifts = [...this.fixedShifts, ...shifts];
      for (const s of allShifts) {
        if (s.doctor_id !== docId || s.shift_type === 'rest') continue;
        const sp = s.shift_date.split('-').map(Number);
        const sStartMs = s.shift_type === 'night'
          ? utcMs(sp[0], sp[1] - 1, sp[2], 20)
          : utcMs(sp[0], sp[1] - 1, sp[2], 8);
        const sEndMs = s.shift_type === 'day'
          ? utcMs(sp[0], sp[1] - 1, sp[2], 20)
          : utcMs(sp[0], sp[1] - 1, sp[2] + 1, 8); // night & 24h end next day 08:00

        // New shift is after existing shift
        if (newStartMs >= sEndMs) {
          const gapH = (newStartMs - sEndMs) / 3_600_000;
          const reqRest = s.shift_type === 'night' ? 48 : s.shift_type === '24h' ? 72 : 24;
          if (gapH < reqRest) return true;
        }
        // New shift is before existing shift
        if (sStartMs >= newEndMs) {
          const gapH = (sStartMs - newEndMs) / 3_600_000;
          const reqRest = shiftType === 'night' ? 48 : 24;
          if (gapH < reqRest) return true;
        }
      }
      return false;
    };

    for (const slot of uncoveredSlots) {
      const currentDate = new Date(this.year, this.month, slot.day);
      const assigned = assignedByDay.get(slot.day)!;

      const candidates = gapFillers
        .filter(doc => {
          if (assigned.has(doc.id)) return false;
          if (isDoctorOnLeave(this, doc.id, currentDate)) return false;
          if (isDoctorOnBridgeDay(this, doc.id, currentDate)) return false;
          // Prevent double-assignment on same day (already has shift from Phase 1)
          const hasShiftToday = shifts.some(s =>
            s.doctor_id === doc.id && s.shift_date === slot.dateStr
          );
          if (hasShiftToday) return false;
          return true;
        })
        .sort((a, b) => getShiftCount(a.id) - getShiftCount(b.id));

      let filled = 0;
      for (const doc of candidates) {
        if (filled >= slot.needed) break;
        // Enforce max_doctors_per_shift (checked here so count updates as doctors are placed)
        if (doc.team_id) {
          const team = teamById.get(doc.team_id);
          if (team?.max_doctors_per_shift) {
            const allTeamDocIds = new Set(this.doctors.filter(d => d.team_id === doc.team_id).map(d => d.id));
            // Count both same-type shifts AND 24h shifts (which cover both day and night)
            const teamCountOnSlot = shifts.filter(s =>
              s.shift_date === slot.dateStr &&
              (s.shift_type === slot.shiftType || s.shift_type === '24h') &&
              allTeamDocIds.has(s.doctor_id)
            ).length;
            if (teamCountOnSlot >= team.max_doctors_per_shift) continue;
          }
        }
        // Cap rest violations per doctor: skip if this would create a new violation
        // and the doctor already has too many
        const causesViolation = wouldViolateRest(doc.id, slot.dateStr, slot.shiftType);
        if (causesViolation) {
          const existing = doctorViolationCount.get(doc.id) || 0;
          if (existing >= MAX_VIOLATIONS_PER_DOCTOR) continue;
          doctorViolationCount.set(doc.id, existing + 1);
        }
        shifts.push({
          id: this.generateId(),
          doctor_id: doc.id,
          shift_date: slot.dateStr,
          shift_type: slot.shiftType,
          start_time: slot.shiftType === 'day' ? '08:00' : '20:00',
          end_time: slot.shiftType === 'day' ? '20:00' : '08:00',
          is_forced_coverage: true,
        });
        recordShift(this, doc, currentDate, slot.shiftType);
        assigned.add(doc.id);
        filled++;
      }
    }

    // ── Final: Validation & warnings ──
    rebuildCounters(this, shifts);

    const normWarnings = checkDoctorNorms(this);
    if (normWarnings.length > 0) {
      warnings.push(...normWarnings);
    }

    applyShiftRounding(this, shifts);

    // Restore full doctor list for stats and conflict detection
    this.doctors = allDoctors;
    rebuildCounters(this, shifts);

    const allShifts = [...this.fixedShifts, ...shifts];
    const conflicts = detectConflicts(allShifts, this.doctors, this.shiftsPerDay, this.shiftsPerNight);
    const doctorStats = calculateDoctorStats(this, shifts);

    for (const c of conflicts) {
      if (c.type === 'understaffed') {
        warnings.push(c.message);
      }
    }

    return { shifts, conflicts, warnings, doctorStats };
  }

  // ── Static methods (same as v1, delegated to validation module) ──

  static detectConflicts(shifts: Shift[], doctors: Doctor[], requiredPerDay = 2, requiredPerNight = 2): ScheduleConflict[] {
    return detectConflicts(shifts, doctors, requiredPerDay, requiredPerNight);
  }
}
