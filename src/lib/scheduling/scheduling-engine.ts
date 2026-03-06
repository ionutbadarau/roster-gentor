/**
 * SchedulingEngine — thin orchestrator that coordinates the scheduling modules.
 *
 * Algorithm overview (see ALGORITHM.md for full details):
 * 1. Initialize: parse options, compute bridge days, build fixed-shift index
 * 2. Greedy pass: day-by-day assignment using pace-aware team-preferring selection
 * 3. Repair pass: backtracking solver for unfilled slots
 * 4. Validation: check norms, detect conflicts, compute stats
 */

import type { DoctorWithTeam, Shift, LeaveDay, NationalHoliday, ScheduleConflict, ScheduleGenerationResult, DoctorMonthlyStats, ScheduleValidation, Doctor } from '@/types/scheduling';
import { SCHEDULING_CONSTANTS, type ScheduleGenerationOptions, type EngineContext } from './constants';
import { formatDate, utcMs, getDaysInMonth, getWorkingDaysInMonth } from './calendar-utils';
import { computeAllBridgeDays, computeDoctorBridgeDays } from './bridge-days';
import { isDoctorOnLeave, isDoctorOnBridgeDay } from './constraints';
import { selectDoctorsForShift } from './doctor-selection';
import { repairUnfilledSlots, repairNormDeficits } from './repair';
import { recordShift, rebuildCounters, checkDoctorNorms, applyShiftRounding, calculateDoctorStats, calculateBaseNorm } from './stats';
import { detectConflicts, validateLeaveDays, calculatePossibleLeaveDays, getWorkingDaysInMonthStatic, computeUnderstaffedDays } from './validation';

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
      if (fs.shift_type !== 'day' && fs.shift_type !== 'night') continue;
      const parts = fs.shift_date.split('-').map(Number);
      const startMs = fs.shift_type === 'day'
        ? utcMs(parts[0], parts[1] - 1, parts[2], 8)
        : utcMs(parts[0], parts[1] - 1, parts[2], 20);
      if (!this.fixedShiftsByDoctor.has(fs.doctor_id)) {
        this.fixedShiftsByDoctor.set(fs.doctor_id, []);
      }
      this.fixedShiftsByDoctor.get(fs.doctor_id)!.push({ startMs, shiftType: fs.shift_type });
    }

    this.holidayDateSet = new Set(this.nationalHolidays.map(h => h.holiday_date));
    this.doctorBridgeDays = computeAllBridgeDays(this.doctors, this.leaveDays, this.month, this.year, this.nationalHolidays);
  }

  generateSchedule(): ScheduleGenerationResult {
    const daysInMonth = getDaysInMonth(this.year, this.month);
    const shifts: Shift[] = [];
    const warnings: string[] = [];

    // Group doctors by team; floating doctors tracked separately.
    const doctorsByTeam = new Map<string, DoctorWithTeam[]>();
    const floatingDoctors: DoctorWithTeam[] = [];

    this.teams.forEach(team => {
      doctorsByTeam.set(team.id, []);
    });

    this.doctors.forEach(doctor => {
      if (doctor.is_floating) {
        floatingDoctors.push(doctor);
      } else if (doctor.team_id) {
        const teamDoctors = doctorsByTeam.get(doctor.team_id);
        if (teamDoctors) teamDoctors.push(doctor);
      }
    });

    // Initialise counters.
    this.doctors.forEach(d => {
      this.doctorShiftCount.set(d.id, 0);
      this.doctorHours.set(d.id, 0);
      this.doctorWeeklyHours.set(d.id, new Map());
    });

    // Compute each doctor's target number of shifts from their base norm.
    const doctorTargetShifts = new Map<string, number>();
    this.doctors.forEach(d => {
      const baseNorm = calculateBaseNorm(this, d.id);
      doctorTargetShifts.set(d.id, Math.ceil(baseNorm / SCHEDULING_CONSTANTS.SHIFT_DURATION));
    });

    // Pre-compute total available days per doctor (days in month minus leave days and bridge days).
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
      if (ps.shift_type !== 'day' && ps.shift_type !== 'night') continue;
      const doctor = this.doctors.find(d => d.id === ps.doctor_id);
      if (!doctor) continue;
      const dateParts = ps.shift_date.split('-').map(Number);
      const prevDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const endTime = ps.shift_type === 'day'
        ? utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate(), 20)
        : utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1, 8);
      const existing = this.doctorLastShift.get(doctor.id);
      if (!existing || endTime > existing.endTime) {
        this.doctorLastShift.set(doctor.id, { date: prevDate, type: ps.shift_type, endTime });
      }
    }

    // Build a lookup of fixed (manual) shifts by date+type.
    const fixedShiftsByDateType = new Map<string, Shift[]>();
    for (const fs of this.fixedShifts) {
      if (fs.shift_type !== 'day' && fs.shift_type !== 'night') continue;
      const key = `${fs.shift_date}:${fs.shift_type}`;
      if (!fixedShiftsByDateType.has(key)) fixedShiftsByDateType.set(key, []);
      fixedShiftsByDateType.get(key)!.push(fs);
    }

    // ── Day-by-day greedy assignment ──
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = formatDate(currentDate);

      // Register fixed shifts for this day.
      for (const shiftType of ['day', 'night'] as const) {
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedForSlot = fixedShiftsByDateType.get(fixedKey);
        if (fixedForSlot) {
          for (const fs of fixedForSlot) {
            const doctor = this.doctors.find(d => d.id === fs.doctor_id);
            if (doctor) recordShift(this, doctor, currentDate, shiftType);
          }
        }
      }

      // Update elapsed available days for each doctor.
      for (const doc of this.doctors) {
        if (!isDoctorOnLeave(this, doc.id, currentDate) && !isDoctorOnBridgeDay(this, doc.id, currentDate)) {
          doctorElapsedAvailDays.set(doc.id, (doctorElapsedAvailDays.get(doc.id) || 0) + 1);
        }
      }

      for (const shiftType of ['day', 'night'] as const) {
        const baseSlots = shiftType === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const slotsNeeded = Math.max(0, baseSlots - fixedCount);

        if (slotsNeeded === 0) continue;

        const selected = selectDoctorsForShift(
          this, doctorsByTeam, floatingDoctors, teamIds, currentDate, shiftType,
          slotsNeeded, doctorTargetShifts, doctorTotalAvailDays, doctorElapsedAvailDays
        );

        for (const doctor of selected) {
          shifts.push({
            id: crypto.randomUUID(),
            doctor_id: doctor.id,
            shift_date: dateStr,
            shift_type: shiftType,
            start_time: shiftType === 'day' ? '08:00' : '20:00',
            end_time: shiftType === 'day' ? '20:00' : '08:00',
          });
          recordShift(this, doctor, currentDate, shiftType);
        }
      }
    }

    // ── Repair pass ──
    repairUnfilledSlots(this, shifts, fixedShiftsByDateType);

    // Rebuild counters from final shifts (greedy-pass counters are stale after repair)
    rebuildCounters(this, shifts);

    // ── Norm equalization repair ──
    repairNormDeficits(this, shifts);
    rebuildCounters(this, shifts);

    const normWarnings = checkDoctorNorms(this);
    if (normWarnings.length > 0) {
      warnings.push(...normWarnings);
    }

    applyShiftRounding(this, shifts);

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
