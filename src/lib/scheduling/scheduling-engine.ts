/**
 * SchedulingEngine — thin orchestrator that coordinates the scheduling modules.
 *
 * Algorithm overview (see ALGORITHM.md for full details):
 * 1. Compute cadence grid (D-N-R-R per team, staggered by order)
 * 2. Cadence assignment: team doctors follow their cadence
 * 3. 24h floating stagger: one 24h doctor per day
 * 4. Gap-filling: remaining slots from off-cadence team doctors + floating
 * 5. Repair pass: backtracking solver for unfilled slots
 * 6. Validation: check norms, detect conflicts, compute stats
 */

import type { DoctorWithTeam, Shift, LeaveDay, NationalHoliday, ScheduleConflict, ScheduleGenerationResult, DoctorMonthlyStats, ScheduleValidation, Doctor } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS, type ScheduleGenerationOptions, type EngineContext } from './constants';
import { formatDate, utcMs, getDaysInMonth, getWorkingDaysInMonth } from './calendar-utils';
import { computeAllBridgeDays, computeDoctorBridgeDays } from './bridge-days';
import { isDoctorOnLeave, isDoctorOnBridgeDay } from './constraints';
import { selectDoctorsForShift } from './doctor-selection';
import { repairUnfilledSlots, repairNormDeficits, repairExtraShiftEqualization, repairWithLocalSearch } from './repair';
import { recordShift, recordShift24h, rebuildCounters, checkDoctorNorms, applyShiftRounding, calculateDoctorStats, calculateBaseNorm } from './stats';
import { detectConflicts, validateLeaveDays, calculatePossibleLeaveDays, getWorkingDaysInMonthStatic, computeUnderstaffedDays } from './validation';
import { computeTeamCadenceGrid, computeDoctorCadenceSchedule } from './cadence';

export class SchedulingEngine implements EngineContext {
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

  constructor(options: ScheduleGenerationOptions) {
    this.doctors = options.doctors;
    this.teams = options.teams.sort((a, b) => a.order - b.order);
    this.month = options.month;
    this.year = options.year;
    this.shiftsPerDay = options.shiftsPerDay;
    this.shiftsPerNight = options.shiftsPerNight;
    this.leaveDays = options.leaveDays || [];
    this.nationalHolidays = options.nationalHolidays || [];
    this.fixedShifts = options.fixedShifts || [];
    this.previousMonthShifts = options.previousMonthShifts || [];

    // Build per-doctor lookup of fixed shift start times for forward rest checks
    for (const fs of this.fixedShifts) {
      if (fs.shift_type !== 'day' && fs.shift_type !== 'night' && fs.shift_type !== '24h') continue;
      const parts = fs.shift_date.split('-').map(Number);
      const startMs = fs.shift_type === 'night'
        ? utcMs(parts[0], parts[1] - 1, parts[2], 20)
        : utcMs(parts[0], parts[1] - 1, parts[2], 8); // day and 24h both start at 08:00
      if (!this.fixedShiftsByDoctor.has(fs.doctor_id)) {
        this.fixedShiftsByDoctor.set(fs.doctor_id, []);
      }
      const shiftType = fs.shift_type === '24h' ? 'day' : fs.shift_type;
      this.fixedShiftsByDoctor.get(fs.doctor_id)!.push({ startMs, shiftType });
    }

    this.holidayDateSet = new Set(this.nationalHolidays.map(h => h.holiday_date));
    this.doctorBridgeDays = computeAllBridgeDays(this.doctors, this.leaveDays, this.month, this.year, this.nationalHolidays);
  }

  generateSchedule(): ScheduleGenerationResult {
    const daysInMonth = getDaysInMonth(this.year, this.month);
    const shifts: Shift[] = [];
    const warnings: string[] = [];

    // Filter out optional doctors — they only get shifts manually
    const allDoctors = this.doctors;
    this.doctors = allDoctors.filter(d => !d.is_optional);

    // ── Doctor classification ──
    const doctorsByTeam = new Map<string, DoctorWithTeam[]>();
    const floatingDoctors: DoctorWithTeam[] = [];

    this.teams.forEach(team => {
      doctorsByTeam.set(team.id, []);
    });

    this.doctors.forEach(doctor => {
      if (doctor.shift_mode === '24h') return; // handled separately
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

    // Compute each doctor's base norm target (minimum shifts).
    const doctorBaseTargets = new Map<string, number>();
    this.doctors.forEach(d => {
      const baseNorm = calculateBaseNorm(this, d.id);
      doctorBaseTargets.set(d.id, Math.ceil(baseNorm / SCHEDULING_CONSTANTS.SHIFT_DURATION));
    });

    // Equalize: distribute extra shifts (beyond sum of base norms) fairly.
    const totalSlots = daysInMonth * (this.shiftsPerDay + this.shiftsPerNight);
    let sumBaseTargets = 0;
    doctorBaseTargets.forEach(t => { sumBaseTargets += t; });
    const totalExtraShifts = Math.max(0, totalSlots - sumBaseTargets);
    const fairExtraPerDoctor = totalExtraShifts / this.doctors.length;

    const doctorTargetShifts = new Map<string, number>();
    for (const d of this.doctors) {
      const base = doctorBaseTargets.get(d.id) || 0;
      doctorTargetShifts.set(d.id, base + fairExtraPerDoctor);
    }

    // Pre-compute total available days per doctor.
    const doctorTotalAvailDays = new Map<string, number>();
    for (const doc of this.doctors) {
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(this.year, this.month, d);
        if (!isDoctorOnLeave(this, doc.id, date) && !isDoctorOnBridgeDay(this, doc.id, date)) count++;
      }
      doctorTotalAvailDays.set(doc.id, count);
    }

    // Track elapsed available days per doctor (updated day by day).
    const doctorElapsedAvailDays = new Map<string, number>();
    this.doctors.forEach(d => doctorElapsedAvailDays.set(d.id, 0));

    const teamIds = this.teams.map(t => t.id);

    // Seed rest constraints from the last shifts of the previous month.
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

    // Build a lookup of fixed (manual) shifts by date+type.
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
    const teamCadence = computeTeamCadenceGrid(this.teams, daysInMonth);
    this.doctorCadence = computeDoctorCadenceSchedule(this.doctors, teamCadence);

    const restDays24h = Math.ceil(SCHEDULING_CONSTANTS.SHIFT_24H_REST / 24); // 3
    const minGap = restDays24h + 1; // 4

    // ── 24h allocation helper ──
    // Phase 1: Optimal offset permutation search for primary doctors
    // Phase 2: Greedy day-by-day fill for swing doctors
    // Phase 3: Extra coverage on tight days
    const compute24hAlloc = (perturbSeed: number): Map<number, string[]> => {
      const alloc = new Map<number, string[]>();
      const workDays = new Map<string, number[]>();
      for (const doc of doctors24h) workDays.set(doc.id, []);

      const canAssign = (docId: string, day: number): boolean => {
        const wd = workDays.get(docId) || [];
        for (const w of wd) {
          if (Math.abs(day - w) <= restDays24h) return false;
        }
        const date = new Date(this.year, this.month, day);
        if (isDoctorOnLeave(this, docId, date)) return false;
        if (isDoctorOnBridgeDay(this, docId, date)) return false;
        return true;
      };
      const assignDoc = (docId: string, day: number) => {
        if (!alloc.has(day)) alloc.set(day, []);
        alloc.get(day)!.push(docId);
        workDays.get(docId)!.push(day);
      };

      // Pre-compute per-day 12h availability
      const docs12h = this.doctors.filter(d => d.shift_mode !== '24h');
      const dayAvail = new Map<number, number>();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(this.year, this.month, day);
        let avail = 0;
        for (const doc of docs12h) {
          if (!isDoctorOnLeave(this, doc.id, date) && !isDoctorOnBridgeDay(this, doc.id, date)) avail++;
        }
        dayAvail.set(day, avail);
      }
      const maxAvail = Math.max(...Array.from(dayAvail.values()));

      // Pre-compute per-doctor available days for stagger scoring
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

      // Count how many shifts a doctor gets on a given offset (every minGap days)
      const countShiftsOnOffset = (docId: string, offset: number): number => {
        const avail = doctorAvailDays.get(docId)!;
        let count = 0;
        for (let day = offset; day <= daysInMonth; day += minGap) {
          if (avail.has(day)) count++;
        }
        return count;
      };

      // Tightness score for an offset: sum of (maxAvail - avail) for each day
      const tightnessOnOffset = (docId: string, offset: number): number => {
        const avail = doctorAvailDays.get(docId)!;
        let score = 0;
        for (let day = offset; day <= daysInMonth; day += minGap) {
          if (avail.has(day)) {
            score += Math.max(0, maxAvail - (dayAvail.get(day) || 0));
          }
        }
        return score;
      };

      // ── Phase 1: Find best doctor→offset assignment via permutation search ──
      // With ≤6 doctors and 4 offsets, try all combinations to maximize total shifts.
      const numPrimary = Math.min(doctors24h.length, minGap);
      const offsets = Array.from({ length: minGap }, (_, i) => i + 1);

      // Generate all permutations of offsets for primary doctor slots
      const permute = (arr: number[]): number[][] => {
        if (arr.length <= 1) return [arr];
        const result: number[][] = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const perm of permute(rest)) {
            result.push([arr[i], ...perm]);
          }
        }
        return result;
      };

      // Generate all C(n,k) combinations of choosing k doctors from n
      const combinations = (items: number[], k: number): number[][] => {
        if (k === 0) return [[]];
        if (items.length < k) return [];
        const result: number[][] = [];
        for (let i = 0; i <= items.length - k; i++) {
          for (const combo of combinations(items.slice(i + 1), k - 1)) {
            result.push([items[i], ...combo]);
          }
        }
        return result;
      };

      const doctorIndices = Array.from({ length: doctors24h.length }, (_, i) => i);
      const primaryCombos = combinations(doctorIndices, numPrimary);
      const offsetPerms = permute(offsets);

      let bestAssignment: { docIdx: number; offset: number }[] = [];
      let bestTotalShifts = -1;
      let bestTightness = -1;

      for (const combo of primaryCombos) {
        for (const perm of offsetPerms) {
          let totalShifts = 0;
          let totalTightness = 0;
          for (let i = 0; i < numPrimary; i++) {
            const doc = doctors24h[combo[i]];
            const shifts = countShiftsOnOffset(doc.id, perm[i]);
            totalShifts += shifts;
            totalTightness += tightnessOnOffset(doc.id, perm[i]);
          }
          if (totalShifts > bestTotalShifts ||
              (totalShifts === bestTotalShifts && totalTightness > bestTightness)) {
            bestTotalShifts = totalShifts;
            bestTightness = totalTightness;
            bestAssignment = combo.map((docIdx, i) => ({ docIdx, offset: perm[i] }));
          }
        }
      }

      // Apply best primary assignment
      const primaryDocIds = new Set<string>();
      for (const { docIdx, offset } of bestAssignment) {
        const doc = doctors24h[docIdx];
        primaryDocIds.add(doc.id);
        for (let day = offset; day <= daysInMonth; day += minGap) {
          if (canAssign(doc.id, day)) {
            assignDoc(doc.id, day);
          }
        }
      }

      // ── Phase 2: Swing doctors — greedy day-by-day fill ──
      // For remaining doctors, iterate through days (tightest first) and assign greedily.
      const swingDocs = doctors24h.filter(d => !primaryDocIds.has(d.id));
      if (swingDocs.length > 0) {
        // Sort days by tightness (lowest 12h availability first)
        const daysByTightness = Array.from({ length: daysInMonth }, (_, i) => i + 1)
          .sort((a, b) => (dayAvail.get(a) || 0) - (dayAvail.get(b) || 0));

        // Use perturbSeed to vary the day ordering for diversity across attempts
        if (perturbSeed > 0) {
          // Shift the tightness order slightly for different attempts
          const shift = perturbSeed % daysByTightness.length;
          // Group equally-tight days and shuffle within groups
          for (let i = 0; i < daysByTightness.length; i++) {
            const j = i + (perturbSeed * 7 + i * 3) % Math.max(1, daysByTightness.length - i);
            if (j < daysByTightness.length && j !== i) {
              const ai = dayAvail.get(daysByTightness[i]) || 0;
              const aj = dayAvail.get(daysByTightness[j]) || 0;
              if (ai === aj) {
                [daysByTightness[i], daysByTightness[j]] = [daysByTightness[j], daysByTightness[i]];
              }
            }
          }
        }

        for (const day of daysByTightness) {
          const allocCount = alloc.get(day)?.length || 0;
          if (allocCount >= 2) continue; // Max 2 24h doctors per day

          // Sort swing doctors by fewest shifts (equalize), with perturbation for ties
          const sorted = [...swingDocs].sort((a, b) => {
            const aShifts = workDays.get(a.id)?.length || 0;
            const bShifts = workDays.get(b.id)?.length || 0;
            if (aShifts !== bShifts) return aShifts - bShifts;
            // Tiebreak: prefer doctor with fewer total available days (more constrained)
            return (doctorAvailDays.get(a.id)?.size || 0) - (doctorAvailDays.get(b.id)?.size || 0);
          });

          for (const doc of sorted) {
            if (canAssign(doc.id, day)) {
              assignDoc(doc.id, day);
              break;
            }
          }
        }
      }

      // ── Phase 3: Extra coverage on tight days ──
      const daysByTightness2 = Array.from({ length: daysInMonth }, (_, i) => i + 1)
        .sort((a, b) => (dayAvail.get(a) || 0) - (dayAvail.get(b) || 0));

      const restEstimate = this.shiftsPerNight * 2 + this.shiftsPerDay;
      for (const day of daysByTightness2) {
        const allocCount = alloc.get(day)?.length || 0;
        if (allocCount >= 2) continue;
        const avail = dayAvail.get(day) || 0;
        const slotsNeeded12h = (this.shiftsPerDay - allocCount) + (this.shiftsPerNight - allocCount);
        const effectiveAvail = Math.max(0, avail - restEstimate);
        if (effectiveAvail >= slotsNeeded12h) continue;

        const sortedDocs = [...doctors24h].sort((a, b) =>
          (workDays.get(a.id)?.length || 0) - (workDays.get(b.id)?.length || 0)
        );
        for (const doc of sortedDocs) {
          if (canAssign(doc.id, day)) {
            assignDoc(doc.id, day);
            break;
          }
        }
      }

      return alloc;
    };

    // Pre-compute 24h allocation variants for multi-attempt diversity.
    const alloc24hVariants: Map<number, string[]>[] = [];
    // Generate several variants with different perturbation seeds
    const numVariants = Math.max(minGap, 6);
    for (let seed = 0; seed < numVariants; seed++) {
      alloc24hVariants.push(compute24hAlloc(seed));
    }

    // ── Multi-attempt greedy with cadence-aware scoring ──
    // Each attempt uses a different 24h allocation (cycling through swing
    // offsets) combined with random score perturbation for search diversity.
    const NUM_ATTEMPTS = 30;
    let bestShifts: Shift[] = [];
    let bestUnfilled = Infinity;
    let bestNormDeficit = Infinity;

    // Save state that the greedy mutates so we can reset between attempts.
    const savedLastShift = new Map(this.doctorLastShift);

    for (let attempt = 0; attempt < NUM_ATTEMPTS; attempt++) {
      // Select 24h allocation: cycle through variants
      const preAlloc24h = alloc24hVariants[attempt % alloc24hVariants.length];
      const attemptShifts: Shift[] = [];

      // Reset mutable state for each attempt.
      this.doctorShiftCount = new Map();
      this.doctorHours = new Map();
      this.doctorWeeklyHours = new Map();
      this.doctorLastShift = new Map(savedLastShift);
      this.doctors.forEach(d => {
        this.doctorShiftCount.set(d.id, 0);
        this.doctorHours.set(d.id, 0);
        this.doctorWeeklyHours.set(d.id, new Map());
      });
      const attemptElapsed = new Map<string, number>();
      this.doctors.forEach(d => attemptElapsed.set(d.id, 0));

      // Random perturbation (attempt 0 = no perturbation for determinism).
      this.scorePerturbation = new Map();
      if (attempt > 0) {
        // Score perturbation for diversity. First alloc24hVariants.length attempts
        // use small perturbation; later attempts use larger perturbation.
        const scale = attempt < alloc24hVariants.length ? 4 : 12;
        for (const doc of this.doctors) {
          this.scorePerturbation.set(doc.id, (Math.random() - 0.5) * scale);
        }
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(this.year, this.month, day);
        const dateStr = formatDate(currentDate);

        // Register fixed (manual) shifts for this day.
        const fixed24hOnDate = new Set<string>();
        for (const fs of this.fixedShifts) {
          if (fs.shift_date !== dateStr) continue;
          const doctor = this.doctors.find(d => d.id === fs.doctor_id);
          if (!doctor) continue;
          if (fs.shift_type === '24h') {
            if (!fixed24hOnDate.has(doctor.id)) {
              fixed24hOnDate.add(doctor.id);
              recordShift24h(this, doctor, currentDate);
            }
          } else if (fs.shift_type === 'day' || fs.shift_type === 'night') {
            recordShift(this, doctor, currentDate, fs.shift_type);
          }
        }

        // Update elapsed available days for each doctor.
        for (const doc of this.doctors) {
          if (!isDoctorOnLeave(this, doc.id, currentDate) && !isDoctorOnBridgeDay(this, doc.id, currentDate)) {
            attemptElapsed.set(doc.id, (attemptElapsed.get(doc.id) || 0) + 1);
          }
        }

        // Count remaining slots (after fixed shifts).
        const fixedDayCount = fixedShiftsByDateType.get(`${dateStr}:day`)?.length || 0;
        const fixedNightCount = fixedShiftsByDateType.get(`${dateStr}:night`)?.length || 0;
        let remainDaySlots = Math.max(0, this.shiftsPerDay - fixedDayCount);
        let remainNightSlots = Math.max(0, this.shiftsPerNight - fixedNightCount);

        // Track who is assigned today (to avoid double-assignment).
        const assignedToday = new Set<string>();

        // ── Emit pre-allocated 24h shifts ──
        const allocated24h = preAlloc24h.get(day) || [];
        for (const docId of allocated24h) {
          if (remainDaySlots <= 0 || remainNightSlots <= 0) break;
          const doctor = doctors24h.find(d => d.id === docId)!;
          attemptShifts.push({
            id: crypto.randomUUID(),
            doctor_id: doctor.id,
            shift_date: dateStr,
            shift_type: '24h',
            start_time: '08:00',
            end_time: '08:00',
          });
          recordShift24h(this, doctor, currentDate);
          assignedToday.add(doctor.id);
          remainDaySlots--;
          remainNightSlots--;
        }

        // ── Greedy assignment with cadence-aware scoring ──
        for (const shiftType of ['day', 'night'] as const) {
          const slotsNeeded = shiftType === 'day' ? remainDaySlots : remainNightSlots;
          if (slotsNeeded <= 0) continue;

          const selected = selectDoctorsForShift(
            this, doctorsByTeam, floatingDoctors, teamIds, currentDate, shiftType,
            slotsNeeded, doctorTargetShifts, doctorTotalAvailDays, attemptElapsed,
            assignedToday, daysInMonth
          );

          for (const doctor of selected) {
            attemptShifts.push({
              id: crypto.randomUUID(),
              doctor_id: doctor.id,
              shift_date: dateStr,
              shift_type: shiftType,
              start_time: shiftType === 'day' ? '08:00' : '20:00',
              end_time: shiftType === 'day' ? '20:00' : '08:00',
            });
            recordShift(this, doctor, currentDate, shiftType);
            assignedToday.add(doctor.id);
            if (shiftType === 'day') remainDaySlots--;
            else remainNightSlots--;
          }
        }
      }

      // Count unfilled slots for this attempt.
      let unfilled = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(new Date(this.year, this.month, day));
        for (const st of ['day', 'night'] as const) {
          const required = st === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
          const fixedKey = `${dateStr}:${st}`;
          const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
          const genCount = attemptShifts.filter(s => s.shift_date === dateStr && s.shift_type === st).length;
          const gen24h = attemptShifts.filter(s => s.shift_date === dateStr && s.shift_type === '24h').length;
          if (fixedCount + genCount + gen24h < required) unfilled++;
        }
      }

      // Count norm-deficit doctors for this attempt.
      let normDeficit = 0;
      for (const doc of this.doctors) {
        const norm = calculateBaseNorm(this, doc.id);
        const hours = this.doctorHours.get(doc.id) || 0;
        if (hours < norm) normDeficit++;
      }

      if (unfilled < bestUnfilled || (unfilled === bestUnfilled && normDeficit < bestNormDeficit)) {
        bestUnfilled = unfilled;
        bestNormDeficit = normDeficit;
        bestShifts = attemptShifts;
      }
      if (bestUnfilled === 0 && bestNormDeficit === 0) break;
    }

    // Use best attempt's shifts.
    shifts.push(...bestShifts);

    // Restore counters from best shifts.
    rebuildCounters(this, shifts);

    // ── Repair pass (includes full-month solver if greedy left gaps) ──
    repairUnfilledSlots(this, shifts, fixedShiftsByDateType);

    // ── ILS repair for remaining unfilled slots ──
    repairWithLocalSearch(this, shifts, fixedShiftsByDateType, 3000);

    // Rebuild counters from final shifts (greedy-pass counters are stale after repair)
    rebuildCounters(this, shifts);

    // ── Norm equalization repair ──
    repairNormDeficits(this, shifts);
    rebuildCounters(this, shifts);

    // ── Extra-shift equalization repair ──
    repairExtraShiftEqualization(this, shifts);
    rebuildCounters(this, shifts);

    const normWarnings = checkDoctorNorms(this);
    if (normWarnings.length > 0) {
      warnings.push(...normWarnings);
    }

    applyShiftRounding(this, shifts);

    // Restore full doctor list (including optional) for stats and conflict detection
    this.doctors = allDoctors;
    rebuildCounters(this, shifts);

    // Include fixed (manual) shifts when checking for conflicts
    const allShifts = [...this.fixedShifts, ...shifts];
    const conflicts = SchedulingEngine.detectConflicts(allShifts, this.doctors, this.shiftsPerDay, this.shiftsPerNight);
    const doctorStats = calculateDoctorStats(this, shifts);

    // Surface understaffed conflicts as warnings
    for (const c of conflicts) {
      if (c.type === 'understaffed') {
        warnings.push(c.message);
      }
    }

    return { shifts, conflicts, warnings, doctorStats };
  }

  // ── Static methods (delegated to validation module) ──

  static calculatePossibleLeaveDays(
    month: number, year: number, totalDoctors: number,
    shiftsPerDay: number, shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): number {
    return calculatePossibleLeaveDays(month, year, totalDoctors, shiftsPerDay, shiftsPerNight, nationalHolidays);
  }

  static getWorkingDaysInMonthStatic(month: number, year: number, nationalHolidays: NationalHoliday[] = []): number {
    return getWorkingDaysInMonthStatic(month, year, nationalHolidays);
  }

  static validateLeaveDays(
    leaveDays: LeaveDay[], doctors: Doctor[], month: number, year: number,
    shiftsPerDay: number, shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): ScheduleValidation {
    return validateLeaveDays(leaveDays, doctors, month, year, shiftsPerDay, shiftsPerNight, nationalHolidays);
  }

  static computeDoctorBridgeDays(
    doctorId: string, leaveDays: LeaveDay[], month: number, year: number,
    nationalHolidays: NationalHoliday[] = []
  ): Set<string> {
    return computeDoctorBridgeDays(doctorId, leaveDays, month, year, nationalHolidays);
  }

  static computeUnderstaffedDays(
    month: number, year: number, doctors: Doctor[], leaveDays: LeaveDay[],
    shiftsPerDay: number, shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): Map<number, { available: number; required: number }> {
    return computeUnderstaffedDays(month, year, doctors, leaveDays, shiftsPerDay, shiftsPerNight, nationalHolidays);
  }

  static detectConflicts(shifts: Shift[], doctors: Doctor[], requiredPerDay = 2, requiredPerNight = 2): ScheduleConflict[] {
    return detectConflicts(shifts, doctors, requiredPerDay, requiredPerNight);
  }
}
