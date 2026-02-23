import { Doctor, Shift, ScheduleConflict, Team, DoctorWithTeam, LeaveDay, DoctorMonthlyStats, ScheduleGenerationResult, ScheduleValidation } from '@/types/scheduling';

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
}

export class SchedulingEngine {
  private doctors: DoctorWithTeam[];
  private teams: Team[];
  private month: number;
  private year: number;
  private shiftsPerDay: number;
  private shiftsPerNight: number;
  private leaveDays: LeaveDay[];
  private doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' | '24h'; endTime: Date }> = new Map();
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
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
    }
    return workingDays;
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

  private canDoctorWork(doctor: DoctorWithTeam, date: Date, shiftType: 'day' | 'night'): boolean {
    if (this.isDoctorOnLeave(doctor.id, date)) {
      return false;
    }

    const lastShift = this.doctorLastShift.get(doctor.id);
    
    if (!lastShift) return true;

    const shiftStartTime = shiftType === 'day' 
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0) 
      : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 20, 0);
    
    const hoursSinceLastShift = (shiftStartTime.getTime() - lastShift.endTime.getTime()) / (1000 * 60 * 60);

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

    return true;
  }

  private recordShift(doctor: DoctorWithTeam, date: Date, shiftType: 'day' | 'night'): void {
    const shiftEndTime = shiftType === 'day'
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 20, 0)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 8, 0);

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

    // Pre-compute total available days per doctor (days in month minus leave days).
    const doctorTotalAvailDays = new Map<string, number>();
    for (const doc of this.doctors) {
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (!this.isDoctorOnLeave(doc.id, new Date(this.year, this.month, d))) count++;
      }
      doctorTotalAvailDays.set(doc.id, count);
    }

    // Track elapsed available days per doctor (updated day by day).
    const doctorElapsedAvailDays = new Map<string, number>();
    this.doctors.forEach(d => doctorElapsedAvailDays.set(d.id, 0));

    const teamIds = this.teams.map(t => t.id);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      // Update elapsed available days for each doctor.
      for (const doc of this.doctors) {
        if (!this.isDoctorOnLeave(doc.id, currentDate)) {
          doctorElapsedAvailDays.set(doc.id, (doctorElapsedAvailDays.get(doc.id) || 0) + 1);
        }
      }

      for (const shiftType of ['day', 'night'] as const) {
        const slotsNeeded = shiftType === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
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

    const conflicts = SchedulingEngine.detectConflicts(shifts, this.doctors);
    const doctorStats = this.calculateDoctorStats();

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

      candidates.push({ doc, paceGap, underTarget: current < target });
    };

    for (const teamId of teamIds) {
      for (const doc of doctorsByTeam.get(teamId) || []) consider(doc);
    }
    for (const doc of floatingDoctors) consider(doc);

    // Hard partition: under-target first, then met-target.
    // Within each group, sort by paceGap descending (most behind first).
    const underTarget = candidates
      .filter(c => c.underTarget)
      .sort((a, b) => b.paceGap - a.paceGap);
    const metTarget = candidates
      .filter(c => !c.underTarget)
      .sort((a, b) => b.paceGap - a.paceGap);

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
    shiftsPerNight: number
  ): number {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalShiftsNeeded = daysInMonth * (shiftsPerDay + shiftsPerNight);
    const workingDays = SchedulingEngine.getWorkingDaysInMonthStatic(month, year);
    
    const baseNormPerDoctor = SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * workingDays;
    const totalCapacityHours = totalDoctors * baseNormPerDoctor;
    const totalShiftHours = totalShiftsNeeded * SCHEDULING_CONSTANTS.SHIFT_DURATION;
    
    const excessHours = totalCapacityHours - totalShiftHours;
    
    return Math.max(0, Math.floor(excessHours / SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY));
  }

  static getWorkingDaysInMonthStatic(month: number, year: number): number {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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
    shiftsPerNight: number
  ): ScheduleValidation {
    const possibleLeaveDays = SchedulingEngine.calculatePossibleLeaveDays(
      month, year, doctors.length, shiftsPerDay, shiftsPerNight
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

  static detectConflicts(shifts: Shift[], doctors: Doctor[]): ScheduleConflict[] {
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

      if (dayShiftCount < 2) {
        conflicts.push({
          type: 'understaffed',
          date,
          message: `scheduling.engine.understaffedDay::${JSON.stringify({ count: dayShiftCount })}`,
        });
      }

      if (nightShiftCount < 2) {
        conflicts.push({
          type: 'understaffed',
          date,
          message: `scheduling.engine.understaffedNight::${JSON.stringify({ count: nightShiftCount })}`,
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
