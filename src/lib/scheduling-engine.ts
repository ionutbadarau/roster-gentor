import { Doctor, Shift, ScheduleConflict, Team, DoctorWithTeam, LeaveDay, NationalHoliday, DoctorMonthlyStats, ScheduleGenerationResult, ScheduleValidation } from '@/types/scheduling';

// Constants
export const SCHEDULING_CONSTANTS = {
  SHIFT_DURATION: 12,
  DAY_SHIFT_REST: 24,
  NIGHT_SHIFT_REST: 48,
  SHIFT_24H_REST: 72,
  MAX_WEEKLY_HOURS: 48,
  BASE_NORM_HOURS_PER_DAY: 7,
};

export interface ScheduleGenerationOptions {
  month: number;
  year: number;
  doctors: DoctorWithTeam[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  leaveDays?: LeaveDay[];
  nationalHolidays?: NationalHoliday[];
  fixedShifts?: Shift[];
  previousMonthShifts?: Shift[];
}

export class SchedulingEngine {
  private doctors: DoctorWithTeam[];
  private teams: Team[];
  private month: number;
  private year: number;
  private shiftsPerDay: number;
  private shiftsPerNight: number;
  private leaveDays: LeaveDay[];
  private nationalHolidays: NationalHoliday[];
  private fixedShifts: Shift[];
  private previousMonthShifts: Shift[];
  private holidayDateSet: Set<string>;
  private doctorBridgeDays: Map<string, Set<string>>;
  private doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' | '24h'; endTime: number }> = new Map();
  private fixedShiftsByDoctor: Map<string, { startMs: number; shiftType: 'day' | 'night' }[]> = new Map();
  private doctorShiftCount: Map<string, number> = new Map();
  private doctorHours: Map<string, number> = new Map();
  private doctorWeeklyHours: Map<string, Map<number, number>> = new Map();

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
        ? SchedulingEngine.utcMs(parts[0], parts[1] - 1, parts[2], 8)
        : SchedulingEngine.utcMs(parts[0], parts[1] - 1, parts[2], 20);
      if (!this.fixedShiftsByDoctor.has(fs.doctor_id)) {
        this.fixedShiftsByDoctor.set(fs.doctor_id, []);
      }
      this.fixedShiftsByDoctor.get(fs.doctor_id)!.push({ startMs, shiftType: fs.shift_type });
    }

    this.holidayDateSet = new Set(this.nationalHolidays.map(h => h.holiday_date));
    this.doctorBridgeDays = this.computeBridgeDays();
  }

  private getDaysInMonth(): number {
    return new Date(this.year, this.month + 1, 0).getDate();
  }

  private getWorkingDaysInMonth(): number {
    const daysInMonth = this.getDaysInMonth();
    let workingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.year, this.month, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !this.isHoliday(date)) {
        workingDays++;
      }
    }
    return workingDays;
  }

  private isHoliday(date: Date): boolean {
    return this.holidayDateSet.has(this.formatDate(date));
  }

  private isNonWorkingDay(date: Date): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 || this.isHoliday(date);
  }

  // Compute bridge days per doctor: weekends/holidays that sit between leave days
  // and should block scheduling but NOT count as leave.
  private computeBridgeDays(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    const monthPrefix = `${this.year}-${String(this.month + 1).padStart(2, '0')}`;
    const daysInMonth = this.getDaysInMonth();

    // Group leave days by doctor
    const leaveByDoctor = new Map<string, Set<string>>();
    for (const l of this.leaveDays) {
      if (!l.leave_date.startsWith(monthPrefix)) continue;
      if (!leaveByDoctor.has(l.doctor_id)) leaveByDoctor.set(l.doctor_id, new Set());
      leaveByDoctor.get(l.doctor_id)!.add(l.leave_date);
    }

    leaveByDoctor.forEach((leaveDates, doctorId) => {
      const bridgeDays = new Set<string>();

      // For each day in the month, check if it's a non-working day between leave days
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(this.year, this.month, day);
        const dateStr = this.formatDate(date);

        // Only consider non-working days that are NOT already leave days
        if (!this.isNonWorkingDay(date) || leaveDates.has(dateStr)) continue;

        // Check if there's a leave day before and after this gap
        let hasLeaveBefore = false;
        let hasLeaveAfter = false;

        // Walk backward through consecutive non-working days to find a leave day
        for (let d = day - 1; d >= 1; d--) {
          const checkDate = new Date(this.year, this.month, d);
          const checkStr = this.formatDate(checkDate);
          if (leaveDates.has(checkStr)) { hasLeaveBefore = true; break; }
          if (!this.isNonWorkingDay(checkDate) && !leaveDates.has(checkStr)) break;
        }

        // Walk forward through consecutive non-working days to find a leave day
        for (let d = day + 1; d <= daysInMonth; d++) {
          const checkDate = new Date(this.year, this.month, d);
          const checkStr = this.formatDate(checkDate);
          if (leaveDates.has(checkStr)) { hasLeaveAfter = true; break; }
          if (!this.isNonWorkingDay(checkDate) && !leaveDates.has(checkStr)) break;
        }

        if (hasLeaveBefore && hasLeaveAfter) {
          bridgeDays.add(dateStr);
        }
      }

      if (bridgeDays.size > 0) {
        result.set(doctorId, bridgeDays);
      }
    });

    return result;
  }

  private isDoctorOnBridgeDay(doctorId: string, date: Date): boolean {
    const dateStr = this.formatDate(date);
    return this.doctorBridgeDays.get(doctorId)?.has(dateStr) ?? false;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfMonth = new Date(this.year, this.month, 1);
    const daysDiff = Math.floor((date.getTime() - firstDayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
    return Math.floor(daysDiff / 7);
  }

  private calculateBaseNorm(doctorId: string): number {
    const workingDays = this.getWorkingDaysInMonth();
    const monthPrefix = this.getMonthPrefix();
    const doctorLeaveDays = this.leaveDays.filter(
      l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix)
    ).length;
    // Each leave day counts as a full 12h shift worth of credit toward the norm.
    return SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays - SCHEDULING_CONSTANTS.SHIFT_DURATION * doctorLeaveDays;
  }

  private isDoctorOnLeave(doctorId: string, date: Date): boolean {
    const dateStr = this.formatDate(date);
    return this.leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr);
  }

  // Build a UTC timestamp for a given date and hour, avoiding DST-related
  // arithmetic errors when computing rest periods across timezone transitions.
  private static utcMs(year: number, month: number, day: number, hour: number): number {
    return Date.UTC(year, month, day, hour, 0, 0);
  }

  private canDoctorWork(doctor: DoctorWithTeam, date: Date, shiftType: 'day' | 'night'): boolean {
    if (this.isDoctorOnLeave(doctor.id, date)) {
      return false;
    }

    if (this.isDoctorOnBridgeDay(doctor.id, date)) {
      return false;
    }

    const lastShift = this.doctorLastShift.get(doctor.id);

    if (!lastShift) return true;

    const shiftStartMs = shiftType === 'day'
      ? SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 8)
      : SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20);

    const hoursSinceLastShift = (shiftStartMs - lastShift.endTime) / (1000 * 60 * 60);

    if (lastShift.type === 'day' && hoursSinceLastShift < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) {
      return false;
    }

    if (lastShift.type === 'night' && hoursSinceLastShift < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) {
      return false;
    }

    if (lastShift.type === '24h' && hoursSinceLastShift < SCHEDULING_CONSTANTS.SHIFT_24H_REST) {
      return false;
    }

    const weekNumber = this.getWeekNumber(date);
    const weeklyHours = this.doctorWeeklyHours.get(doctor.id)?.get(weekNumber) || 0;
    if (weeklyHours + SCHEDULING_CONSTANTS.SHIFT_DURATION > SCHEDULING_CONSTANTS.MAX_WEEKLY_HOURS) {
      return false;
    }

    // Forward check: ensure this shift's mandatory rest period doesn't collide
    // with an upcoming fixed (manual) shift for this doctor.
    const fixedForDoctor = this.fixedShiftsByDoctor.get(doctor.id);
    if (fixedForDoctor) {
      const shiftEndMs = shiftType === 'day'
        ? SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20)
        : SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);
      const restNeeded = shiftType === 'day'
        ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
        : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;

      for (const fixed of fixedForDoctor) {
        if (fixed.startMs <= shiftEndMs) continue; // fixed shift is before or at this shift's end — irrelevant
        const gapHours = (fixed.startMs - shiftEndMs) / (1000 * 60 * 60);
        if (gapHours < restNeeded) {
          return false;
        }
      }
    }

    return true;
  }

  // Look-ahead: compute a penalty for assigning this doctor to a shift today.
  // If their mandatory rest would block them on a future day that's already
  // tight on availability, we penalise so the algorithm prefers other doctors.
  //
  // For days at offset ≥ 2, the raw availability from canDoctorWork() doesn't
  // account for intermediate days' assignments (which haven't happened yet).
  // We compensate by subtracting the expected consumption of those intermediate
  // days: each intermediate day will assign shiftsPerNight night-shift doctors
  // (blocked 48h → unavailable next day) and shiftsPerDay day-shift doctors
  // (blocked 24h → unavailable for next day's day shift).
  private getLookaheadPenalty(
    candidate: DoctorWithTeam,
    currentDate: Date,
    shiftType: 'day' | 'night',
  ): number {
    const daysInMonth = this.getDaysInMonth();
    const currentDay = currentDate.getDate();

    // Simulate rest period end for this candidate (using UTC to avoid DST issues)
    const restHours = shiftType === 'night'
      ? SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST
      : SCHEDULING_CONSTANTS.DAY_SHIFT_REST;
    const shiftEndMs = shiftType === 'day'
      ? SchedulingEngine.utcMs(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 20)
      : SchedulingEngine.utcMs(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1, 8);
    const restEndTime = shiftEndMs + restHours * 60 * 60 * 1000;

    let penalty = 0;

    // Check the next 3 days
    for (let offset = 1; offset <= 3; offset++) {
      const futureDay = currentDay + offset;
      if (futureDay > daysInMonth) continue;

      const futureDate = new Date(this.year, this.month, futureDay);

      const dayShiftStartMs = SchedulingEngine.utcMs(futureDate.getFullYear(), futureDate.getMonth(), futureDate.getDate(), 8);
      const nightShiftStartMs = SchedulingEngine.utcMs(futureDate.getFullYear(), futureDate.getMonth(), futureDate.getDate(), 20);

      const blockedForDay = dayShiftStartMs < restEndTime;
      const blockedForNight = nightShiftStartMs < restEndTime;

      if (!blockedForDay && !blockedForNight) continue;

      // Count how many OTHER doctors are available on the future date
      // based on currently-recorded shifts (rest constraints).
      let availForDay = 0;
      let availForNight = 0;
      for (const doc of this.doctors) {
        if (doc.id === candidate.id) continue;
        if (this.isDoctorOnLeave(doc.id, futureDate)) continue;
        if (this.isDoctorOnBridgeDay(doc.id, futureDate)) continue;
        if (this.canDoctorWork(doc, futureDate, 'day')) availForDay++;
        if (this.canDoctorWork(doc, futureDate, 'night')) availForNight++;
      }

      // For offset ≥ 2, account for intermediate days' future assignments.
      // Each intermediate day will assign doctors whose rest blocks future days:
      //   - night shift doctors (48h rest) → blocked for day AND night next day
      //   - day shift doctors (24h rest) → blocked for day shift next day
      if (offset >= 2) {
        const intermediateDays = offset - 1;
        // Night shifts from each intermediate day block doctors for both day+night
        availForDay -= this.shiftsPerNight * intermediateDays;
        availForNight -= this.shiftsPerNight * intermediateDays;
        // Day shifts from each intermediate day block doctors for day shift only
        availForDay -= this.shiftsPerDay * intermediateDays;
      }

      // Penalise if blocking this candidate would leave a future day tight.
      // Required + 2 margin for offset ≥ 2 (more conservative for farther days).
      const margin = offset >= 2 ? 2 : 1;
      if (blockedForDay && availForDay < this.shiftsPerDay + margin) {
        penalty += 5;
      }
      if (blockedForNight && availForNight < this.shiftsPerNight + margin) {
        penalty += 5;
      }
    }

    return penalty;
  }

  private recordShift(doctor: DoctorWithTeam, date: Date, shiftType: 'day' | 'night'): void {
    const shiftEndTime = shiftType === 'day'
      ? SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate(), 20)
      : SchedulingEngine.utcMs(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8);

    this.doctorLastShift.set(doctor.id, { 
      date, 
      type: shiftType,
      endTime: shiftEndTime
    });
    
    this.doctorShiftCount.set(doctor.id, (this.doctorShiftCount.get(doctor.id) || 0) + 1);
    this.doctorHours.set(doctor.id, (this.doctorHours.get(doctor.id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);

    const weekNumber = this.getWeekNumber(date);
    if (!this.doctorWeeklyHours.has(doctor.id)) {
      this.doctorWeeklyHours.set(doctor.id, new Map());
    }
    const weeklyMap = this.doctorWeeklyHours.get(doctor.id)!;
    weeklyMap.set(weekNumber, (weeklyMap.get(weekNumber) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
  }

  generateSchedule(): ScheduleGenerationResult {
    const daysInMonth = this.getDaysInMonth();
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
      const baseNorm = this.calculateBaseNorm(d.id);
      doctorTargetShifts.set(d.id, Math.ceil(baseNorm / SCHEDULING_CONSTANTS.SHIFT_DURATION));
    });

    // Pre-compute total available days per doctor (days in month minus leave days and bridge days).
    const doctorTotalAvailDays = new Map<string, number>();
    for (const doc of this.doctors) {
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(this.year, this.month, d);
        if (!this.isDoctorOnLeave(doc.id, date) && !this.isDoctorOnBridgeDay(doc.id, date)) count++;
      }
      doctorTotalAvailDays.set(doc.id, count);
    }

    // Track elapsed available days per doctor (updated day by day).
    const doctorElapsedAvailDays = new Map<string, number>();
    this.doctors.forEach(d => doctorElapsedAvailDays.set(d.id, 0));

    const teamIds = this.teams.map(t => t.id);

    // Seed rest constraints from the last shifts of the previous month so that
    // doctors who worked near month-end are not scheduled too early (e.g. night
    // shift on Jan 31 → must not get a shift on Feb 1).
    for (const ps of this.previousMonthShifts) {
      if (ps.shift_type !== 'day' && ps.shift_type !== 'night') continue;
      const doctor = this.doctors.find(d => d.id === ps.doctor_id);
      if (!doctor) continue;
      const dateParts = ps.shift_date.split('-').map(Number);
      const prevDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const endTime = ps.shift_type === 'day'
        ? SchedulingEngine.utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate(), 20)
        : SchedulingEngine.utcMs(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1, 8);
      // Only keep the latest shift per doctor
      const existing = this.doctorLastShift.get(doctor.id);
      if (!existing || endTime > existing.endTime) {
        this.doctorLastShift.set(doctor.id, { date: prevDate, type: ps.shift_type, endTime });
      }
    }

    // Build a lookup of fixed (manual) shifts by date+type so the main loop
    // knows how many slots are already filled.
    // key = "YYYY-MM-DD:day" or "YYYY-MM-DD:night"
    const fixedShiftsByDateType = new Map<string, Shift[]>();
    for (const fs of this.fixedShifts) {
      if (fs.shift_type !== 'day' && fs.shift_type !== 'night') continue;
      const key = `${fs.shift_date}:${fs.shift_type}`;
      if (!fixedShiftsByDateType.has(key)) fixedShiftsByDateType.set(key, []);
      fixedShiftsByDateType.get(key)!.push(fs);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      // Register fixed shifts for this day so rest constraints, shift counts,
      // and weekly hours are accounted for at the right time (not prematurely).
      for (const shiftType of ['day', 'night'] as const) {
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedForSlot = fixedShiftsByDateType.get(fixedKey);
        if (fixedForSlot) {
          for (const fs of fixedForSlot) {
            const doctor = this.doctors.find(d => d.id === fs.doctor_id);
            if (doctor) this.recordShift(doctor, currentDate, shiftType);
          }
        }
      }

      // Update elapsed available days for each doctor.
      for (const doc of this.doctors) {
        if (!this.isDoctorOnLeave(doc.id, currentDate) && !this.isDoctorOnBridgeDay(doc.id, currentDate)) {
          doctorElapsedAvailDays.set(doc.id, (doctorElapsedAvailDays.get(doc.id) || 0) + 1);
        }
      }

      for (const shiftType of ['day', 'night'] as const) {
        const baseSlots = shiftType === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
        const fixedKey = `${dateStr}:${shiftType}`;
        const fixedCount = fixedShiftsByDateType.get(fixedKey)?.length || 0;
        const slotsNeeded = Math.max(0, baseSlots - fixedCount);

        if (slotsNeeded === 0) continue;

        const selected = this.selectDoctorsForShift(
          doctorsByTeam, floatingDoctors, teamIds, currentDate, shiftType,
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
          this.recordShift(doctor, currentDate, shiftType);
        }
      }
    }

    const normWarnings = this.checkDoctorNorms();
    if (normWarnings.length > 0) {
      warnings.push(...normWarnings);
    }

    this.applyShiftRounding(shifts);

    // Include fixed (manual) shifts when checking for conflicts
    const allShifts = [...this.fixedShifts, ...shifts];
    const conflicts = SchedulingEngine.detectConflicts(allShifts, this.doctors, this.shiftsPerDay, this.shiftsPerNight);
    const doctorStats = this.calculateDoctorStats();

    // Surface understaffed conflicts as warnings so they're visible in the UI
    for (const c of conflicts) {
      if (c.type === 'understaffed') {
        warnings.push(c.message);
      }
    }

    return { shifts, conflicts, warnings, doctorStats };
  }

  // Pace-aware, team-preferring selection algorithm.
  //
  // For each doctor computes a "paceGap" — how far behind their expected schedule
  // they are, given their target shifts and remaining available days. This ensures
  // doctors with upcoming leave get shifts early (their pace falls behind faster),
  // while doctors without leave aren't starved either.
  //
  // Hard partition: doctors who haven't met their target are always preferred over
  // those who have. Within the under-target group, greedy team-aware selection
  // groups same-team doctors when their paceGaps are similar.
  private selectDoctorsForShift(
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    floatingDoctors: DoctorWithTeam[],
    teamIds: string[],
    currentDate: Date,
    shiftType: 'day' | 'night',
    slotsNeeded: number,
    doctorTargetShifts: Map<string, number>,
    doctorTotalAvailDays: Map<string, number>,
    doctorElapsedAvailDays: Map<string, number>
  ): DoctorWithTeam[] {
    // Candidate with computed priority.
    interface Candidate {
      doc: DoctorWithTeam;
      paceGap: number;
      underTarget: boolean;
      lookaheadPenalty: number;
      continuationBonus: number;
    }

    const candidates: Candidate[] = [];

    const consider = (doc: DoctorWithTeam) => {
      if (!this.canDoctorWork(doc, currentDate, shiftType)) return;

      const target = doctorTargetShifts.get(doc.id) || 0;
      const current = this.doctorShiftCount.get(doc.id) || 0;
      const totalAvail = doctorTotalAvailDays.get(doc.id) || 1;
      const elapsedAvail = doctorElapsedAvailDays.get(doc.id) || 1;

      // paceGap: expected shifts by now minus actual shifts.
      // Positive = behind schedule, negative = ahead.
      const expectedByNow = target * (elapsedAvail / totalAvail);
      const paceGap = expectedByNow - current;

      const lookaheadPenalty = this.getLookaheadPenalty(doc, currentDate, shiftType);

      // Continuation bonus: doctors prefer day(N) → night(N+1) rotation.
      // If selecting for a night shift, strongly prefer doctors who worked
      // the day shift yesterday — this creates the preferred pattern.
      let continuationBonus = 0;
      if (shiftType === 'night') {
        const lastShift = this.doctorLastShift.get(doc.id);
        if (lastShift && lastShift.type === 'day') {
          const yesterday = currentDate.getDate() - 1;
          if (lastShift.date.getDate() === yesterday &&
              lastShift.date.getMonth() === currentDate.getMonth() &&
              lastShift.date.getFullYear() === currentDate.getFullYear()) {
            continuationBonus = 10;
          }
        }
      }

      candidates.push({ doc, paceGap, underTarget: current < target, lookaheadPenalty, continuationBonus });
    };

    for (const teamId of teamIds) {
      for (const doc of doctorsByTeam.get(teamId) || []) consider(doc);
    }
    for (const doc of floatingDoctors) consider(doc);

    // Hard partition: under-target first, then met-target.
    // Within each group, sort by adjusted score (paceGap minus lookahead penalty)
    // descending — most behind first, but penalised if their rest would
    // cause understaffing on upcoming days.
    const sortByScore = (a: Candidate, b: Candidate) =>
      (b.paceGap - b.lookaheadPenalty + b.continuationBonus) -
      (a.paceGap - a.lookaheadPenalty + a.continuationBonus);

    const underTarget = candidates
      .filter(c => c.underTarget)
      .sort(sortByScore);
    const metTarget = candidates
      .filter(c => !c.underTarget)
      .sort(sortByScore);

    const pool = [...underTarget, ...metTarget];
    if (pool.length === 0) return [];

    // Team-aware greedy selection.
    // After picking the first doctor (highest paceGap), for subsequent slots prefer
    // a same-team doctor if one exists within a reasonable paceGap threshold.
    const TEAM_GAP_THRESHOLD = 1.5;
    const selected: DoctorWithTeam[] = [];
    const usedIds = new Set<string>();

    for (let slot = 0; slot < slotsNeeded; slot++) {
      // Get remaining candidates in priority order.
      const remaining = pool.filter(c => !usedIds.has(c.doc.id));
      if (remaining.length === 0) break;

      if (selected.length === 0) {
        // First slot: always pick the highest priority candidate.
        selected.push(remaining[0].doc);
        usedIds.add(remaining[0].doc.id);
      } else {
        // Subsequent slots: prefer same-team within threshold.
        const selectedTeams = new Set(selected.map(d => d.team_id).filter(Boolean));
        const bestGap = remaining[0].paceGap;

        let pick: Candidate | undefined;
        for (const c of remaining) {
          if (bestGap - c.paceGap > TEAM_GAP_THRESHOLD) break;
          if (c.doc.team_id && selectedTeams.has(c.doc.team_id)) {
            pick = c;
            break;
          }
        }

        const chosen = pick || remaining[0];
        selected.push(chosen.doc);
        usedIds.add(chosen.doc.id);
      }
    }

    return selected;
  }

  private checkDoctorNorms(): string[] {
    const warnings: string[] = [];

    for (const doc of this.doctors) {
      const baseNorm = this.calculateBaseNorm(doc.id);
      const currentHours = this.doctorHours.get(doc.id) || 0;

      if (currentHours < baseNorm) {
        const shortfall = baseNorm - currentHours;
        const requiredLeaveDays = Math.ceil(shortfall / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY);
        warnings.push(
          `scheduling.engine.normWarning::${JSON.stringify({ name: doc.name, days: requiredLeaveDays })}`
        );
      }
    }

    return warnings;
  }

  private applyShiftRounding(shifts: Shift[]): void {
    for (const doctor of this.doctors) {
      const baseNorm = this.calculateBaseNorm(doctor.id);
      const currentHours = this.doctorHours.get(doctor.id) || 0;
      
      if (currentHours > baseNorm && currentHours < baseNorm + SCHEDULING_CONSTANTS.SHIFT_DURATION) {
        this.doctorShiftCount.set(doctor.id, (this.doctorShiftCount.get(doctor.id) || 0) + 1);
      }
    }
  }

  private calculateDoctorStats(): DoctorMonthlyStats[] {
    return this.doctors.map(doctor => {
      const baseNorm = this.calculateBaseNorm(doctor.id);
      const totalHours = this.doctorHours.get(doctor.id) || 0;
      const monthPrefix = this.getMonthPrefix();
      const leaveDays = this.leaveDays.filter(
        l => l.doctor_id === doctor.id && l.leave_date.startsWith(monthPrefix)
      ).length;
      
      return {
        doctorId: doctor.id,
        totalHours,
        totalShifts: this.doctorShiftCount.get(doctor.id) || 0,
        dayShifts: 0,
        nightShifts: 0,
        leaveDays,
        baseNorm,
        meetsBaseNorm: totalHours >= baseNorm,
      };
    });
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private getMonthPrefix(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${this.year}-${pad(this.month + 1)}`;
  }

  static calculatePossibleLeaveDays(
    month: number,
    year: number,
    totalDoctors: number,
    shiftsPerDay: number,
    shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): number {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalShiftsNeeded = daysInMonth * (shiftsPerDay + shiftsPerNight);
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(month, year, nationalHolidays);

    const baseNormPerDoctor = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays;
    const totalCapacityHours = totalDoctors * baseNormPerDoctor;
    const totalShiftHours = totalShiftsNeeded * SCHEDULING_CONSTANTS.SHIFT_DURATION;

    const excessHours = totalCapacityHours - totalShiftHours;

    return Math.max(0, Math.floor(excessHours / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY));
  }

  static getWorkingDaysInMonthStatic(month: number, year: number, nationalHolidays: NationalHoliday[] = []): number {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const holidaySet = new Set(nationalHolidays.map(h => h.holiday_date));
    const pad = (n: number) => String(n).padStart(2, '0');
    let workingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
        workingDays++;
      }
    }
    return workingDays;
  }

  static validateLeaveDays(
    leaveDays: LeaveDay[],
    doctors: Doctor[],
    month: number,
    year: number,
    shiftsPerDay: number,
    shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): ScheduleValidation {
    const possibleLeaveDays = SchedulingEngine.calculatePossibleLeaveDays(
      month, year, doctors.length, shiftsPerDay, shiftsPerNight, nationalHolidays
    );
    
    const totalLeaveDays = leaveDays.length;
    
    if (totalLeaveDays > possibleLeaveDays) {
      return {
        isValid: false,
        requiredLeaveDays: possibleLeaveDays,
        message: `scheduling.engine.tooManyLeaveDays::${JSON.stringify({ max: possibleLeaveDays })}`,
      };
    }
    
    return {
      isValid: true,
      requiredLeaveDays: 0,
      message: '',
    };
  }

  // Compute bridge days for a doctor: non-working days (weekends/holidays) between leave days.
  // Returns a Set of date strings that are bridge days for this doctor.
  static computeDoctorBridgeDays(
    doctorId: string,
    leaveDays: LeaveDay[],
    month: number,
    year: number,
    nationalHolidays: NationalHoliday[] = []
  ): Set<string> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const monthPrefix = `${year}-${pad(month + 1)}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const holidaySet = new Set(nationalHolidays.map(h => h.holiday_date));

    const leaveDates = new Set(
      leaveDays
        .filter(l => l.doctor_id === doctorId && l.leave_date.startsWith(monthPrefix))
        .map(l => l.leave_date)
    );

    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const isNonWorking = (d: Date) => {
      const dow = d.getDay();
      return dow === 0 || dow === 6 || holidaySet.has(formatDate(d));
    };

    const bridgeDays = new Set<string>();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDate(date);

      if (!isNonWorking(date) || leaveDates.has(dateStr)) continue;

      let hasLeaveBefore = false;
      let hasLeaveAfter = false;

      for (let d = day - 1; d >= 1; d--) {
        const checkDate = new Date(year, month, d);
        const checkStr = formatDate(checkDate);
        if (leaveDates.has(checkStr)) { hasLeaveBefore = true; break; }
        if (!isNonWorking(checkDate) && !leaveDates.has(checkStr)) break;
      }

      for (let d = day + 1; d <= daysInMonth; d++) {
        const checkDate = new Date(year, month, d);
        const checkStr = formatDate(checkDate);
        if (leaveDates.has(checkStr)) { hasLeaveAfter = true; break; }
        if (!isNonWorking(checkDate) && !leaveDates.has(checkStr)) break;
      }

      if (hasLeaveBefore && hasLeaveAfter) {
        bridgeDays.add(dateStr);
      }
    }

    return bridgeDays;
  }

  // Pre-generation analysis: for each day, check if enough doctors are available
  // (not on leave, not on bridge day) to fill the required shift slots.
  // Returns a map of day number → { available, required } for understaffed days only.
  static computeUnderstaffedDays(
    month: number,
    year: number,
    doctors: Doctor[],
    leaveDays: LeaveDay[],
    shiftsPerDay: number,
    shiftsPerNight: number,
    nationalHolidays: NationalHoliday[] = []
  ): Map<number, { available: number; required: number }> {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const required = shiftsPerDay + shiftsPerNight;
    const result = new Map<number, { available: number; required: number }>();
    const pad = (n: number) => String(n).padStart(2, '0');
    const monthPrefix = `${year}-${pad(month + 1)}`;

    // Pre-compute bridge days per doctor
    const bridgeDaysByDoctor = new Map<string, Set<string>>();
    for (const doc of doctors) {
      bridgeDaysByDoctor.set(
        doc.id,
        SchedulingEngine.computeDoctorBridgeDays(doc.id, leaveDays, month, year, nationalHolidays)
      );
    }

    // Build a set of leave dates per doctor for fast lookup
    const leaveDatesByDoctor = new Map<string, Set<string>>();
    for (const l of leaveDays) {
      if (!l.leave_date.startsWith(monthPrefix)) continue;
      if (!leaveDatesByDoctor.has(l.doctor_id)) leaveDatesByDoctor.set(l.doctor_id, new Set());
      leaveDatesByDoctor.get(l.doctor_id)!.add(l.leave_date);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
      let available = 0;

      for (const doc of doctors) {
        const isOnLeave = leaveDatesByDoctor.get(doc.id)?.has(dateStr) ?? false;
        const isOnBridge = bridgeDaysByDoctor.get(doc.id)?.has(dateStr) ?? false;
        if (!isOnLeave && !isOnBridge) available++;
      }

      if (available < required) {
        result.set(day, { available, required });
      }
    }

    return result;
  }

  static detectConflicts(shifts: Shift[], doctors: Doctor[], requiredPerDay = 2, requiredPerNight = 2): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const shiftsByDate = new Map<string, Shift[]>();

    shifts.forEach(shift => {
      if (!shiftsByDate.has(shift.shift_date)) {
        shiftsByDate.set(shift.shift_date, []);
      }
      shiftsByDate.get(shift.shift_date)!.push(shift);
    });

    shiftsByDate.forEach((dayShifts, date) => {
      const dayShiftCount = dayShifts.filter(s => s.shift_type === 'day').length;
      const nightShiftCount = dayShifts.filter(s => s.shift_type === 'night').length;

      if (dayShiftCount < requiredPerDay) {
        conflicts.push({
          type: 'understaffed',
          date,
          message: `scheduling.engine.understaffedDay::${JSON.stringify({ count: dayShiftCount, required: requiredPerDay, date })}`,
        });
      }

      if (nightShiftCount < requiredPerNight) {
        conflicts.push({
          type: 'understaffed',
          date,
          message: `scheduling.engine.understaffedNight::${JSON.stringify({ count: nightShiftCount, required: requiredPerNight, date })}`,
        });
      }
    });

    const doctorShifts = new Map<string, Shift[]>();
    shifts.forEach(shift => {
      if (!doctorShifts.has(shift.doctor_id)) {
        doctorShifts.set(shift.doctor_id, []);
      }
      doctorShifts.get(shift.doctor_id)!.push(shift);
    });

    doctorShifts.forEach((doctorShiftList, doctorId) => {
      const sortedShifts = doctorShiftList.sort((a, b) => 
        new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
      );

      for (let i = 1; i < sortedShifts.length; i++) {
        const prevShift = sortedShifts[i - 1];
        const currShift = sortedShifts[i];
        
        const prevDate = new Date(prevShift.shift_date);
        const currDate = new Date(currShift.shift_date);
        const hoursBetween = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);

        if (prevShift.shift_type === 'day' && hoursBetween < SCHEDULING_CONSTANTS.DAY_SHIFT_REST) {
          conflicts.push({
            type: 'rest_violation',
            date: currShift.shift_date,
            doctor_id: doctorId,
            message: `scheduling.engine.restViolationDay::${JSON.stringify({ hours: SCHEDULING_CONSTANTS.DAY_SHIFT_REST })}`,
          });
        }

        if (prevShift.shift_type === 'night' && hoursBetween < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) {
          conflicts.push({
            type: 'rest_violation',
            date: currShift.shift_date,
            doctor_id: doctorId,
            message: `scheduling.engine.restViolationNight::${JSON.stringify({ hours: SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST })}`,
          });
        }
      }
    });

    return conflicts;
  }
}
