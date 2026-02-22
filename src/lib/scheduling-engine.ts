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
    const doctorLeaveDays = this.leaveDays.filter(l => l.doctor_id === doctorId).length;
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
    // Doctors with leave days get a lower target.
    const doctorTargetShifts = new Map<string, number>();
    this.doctors.forEach(d => {
      const baseNorm = this.calculateBaseNorm(d.id);
      doctorTargetShifts.set(d.id, Math.ceil(baseNorm / SCHEDULING_CONSTANTS.SHIFT_DURATION));
    });

    const teamIds = this.teams.map(t => t.id);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      for (const shiftType of ['day', 'night'] as const) {
        const slotsNeeded = shiftType === 'day' ? this.shiftsPerDay : this.shiftsPerNight;
        const selected = this.selectDoctorsForShift(
          doctorsByTeam, floatingDoctors, teamIds, currentDate, shiftType, slotsNeeded, doctorTargetShifts
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

  // How many more shifts a doctor still needs to reach their target.
  private getDoctorDeficit(doctorId: string, doctorTargetShifts: Map<string, number>): number {
    const target = doctorTargetShifts.get(doctorId) || 0;
    const current = this.doctorShiftCount.get(doctorId) || 0;
    return target - current;
  }

  // Filters doctors by availability and sorts by deficit desc → cadence → fewest hours.
  private getSortedAvailableDoctorsByNeed(
    doctors: DoctorWithTeam[],
    currentDate: Date,
    shiftType: 'day' | 'night',
    doctorTargetShifts: Map<string, number>
  ): DoctorWithTeam[] {
    return doctors
      .filter(doc => this.canDoctorWork(doc, currentDate, shiftType))
      .sort((a, b) => {
        // Primary: highest deficit first (most needs shifts).
        const aDeficit = this.getDoctorDeficit(a.id, doctorTargetShifts);
        const bDeficit = this.getDoctorDeficit(b.id, doctorTargetShifts);
        if (aDeficit !== bDeficit) return bDeficit - aDeficit;

        // Secondary: cadence preference (Z→N→Z pattern).
        const aLastShift = this.doctorLastShift.get(a.id);
        const bLastShift = this.doctorLastShift.get(b.id);
        const aFollowsCadence = aLastShift && (
          (shiftType === 'day' && aLastShift.type === 'night') ||
          (shiftType === 'night' && aLastShift.type === 'day')
        );
        const bFollowsCadence = bLastShift && (
          (shiftType === 'day' && bLastShift.type === 'night') ||
          (shiftType === 'night' && bLastShift.type === 'day')
        );
        if (aFollowsCadence && !bFollowsCadence) return -1;
        if (!aFollowsCadence && bFollowsCadence) return 1;

        // Tertiary: fewest hours so far.
        return (this.doctorHours.get(a.id) || 0) - (this.doctorHours.get(b.id) || 0);
      });
  }

  // Norm-driven selection: picks the team whose available members have the
  // highest collective deficit, then backfills from other teams + floating.
  private selectDoctorsForShift(
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    floatingDoctors: DoctorWithTeam[],
    teamIds: string[],
    currentDate: Date,
    shiftType: 'day' | 'night',
    slotsNeeded: number,
    doctorTargetShifts: Map<string, number>
  ): DoctorWithTeam[] {
    // For each team compute available members and collective need score.
    const teamAvailable = new Map<string, DoctorWithTeam[]>();
    const teamNeedScore = new Map<string, number>();

    for (const teamId of teamIds) {
      const available = this.getSortedAvailableDoctorsByNeed(
        doctorsByTeam.get(teamId) || [], currentDate, shiftType, doctorTargetShifts
      );
      teamAvailable.set(teamId, available);
      teamNeedScore.set(
        teamId,
        available.reduce((sum, d) => sum + Math.max(0, this.getDoctorDeficit(d.id, doctorTargetShifts)), 0)
      );
    }

    // Sort teams: prefer teams that can fill all slots, then highest need score.
    const sortedTeamIds = [...teamIds].sort((a, b) => {
      const aCanFill = (teamAvailable.get(a)!.length >= slotsNeeded) ? 1 : 0;
      const bCanFill = (teamAvailable.get(b)!.length >= slotsNeeded) ? 1 : 0;
      if (aCanFill !== bCanFill) return bCanFill - aCanFill;
      return (teamNeedScore.get(b) || 0) - (teamNeedScore.get(a) || 0);
    });

    // Start with the best team's available doctors.
    const bestTeamId = sortedTeamIds[0];
    const bestTeamAvail = teamAvailable.get(bestTeamId) || [];
    const selected = bestTeamAvail.slice(0, slotsNeeded);

    // Get available floating doctors sorted by need.
    const availableFloating = this.getSortedAvailableDoctorsByNeed(
      floatingDoctors, currentDate, shiftType, doctorTargetShifts
    );

    // Even when the team fills all slots, swap in floating doctors that have
    // a higher deficit than the lowest-deficit team doctor selected.
    // This ensures floating doctors get their fair share of shifts.
    if (selected.length >= slotsNeeded && availableFloating.length > 0) {
      for (const floater of availableFloating) {
        const floaterDeficit = this.getDoctorDeficit(floater.id, doctorTargetShifts);
        if (floaterDeficit <= 0) break; // floater doesn't need more shifts

        // Find the selected doctor with the lowest deficit.
        let minIdx = 0;
        let minDeficit = this.getDoctorDeficit(selected[0].id, doctorTargetShifts);
        for (let i = 1; i < selected.length; i++) {
          const d = this.getDoctorDeficit(selected[i].id, doctorTargetShifts);
          if (d < minDeficit) { minDeficit = d; minIdx = i; }
        }

        if (floaterDeficit > minDeficit) {
          selected[minIdx] = floater;
        } else {
          break;
        }
      }
    }

    // Backfill remaining slots from other teams + floating doctors.
    if (selected.length < slotsNeeded) {
      const selectedIds = new Set(selected.map(d => d.id));

      const remaining: DoctorWithTeam[] = [];

      // Other teams.
      for (const teamId of sortedTeamIds) {
        if (teamId === bestTeamId) continue;
        for (const doc of teamAvailable.get(teamId) || []) {
          if (!selectedIds.has(doc.id)) remaining.push(doc);
        }
      }

      // Floating doctors.
      for (const doc of availableFloating) {
        if (!selectedIds.has(doc.id)) remaining.push(doc);
      }

      // Sort all remaining by deficit desc.
      remaining.sort((a, b) => {
        const aDeficit = this.getDoctorDeficit(a.id, doctorTargetShifts);
        const bDeficit = this.getDoctorDeficit(b.id, doctorTargetShifts);
        if (aDeficit !== bDeficit) return bDeficit - aDeficit;
        return (this.doctorHours.get(a.id) || 0) - (this.doctorHours.get(b.id) || 0);
      });

      for (const doc of remaining) {
        if (selected.length >= slotsNeeded) break;
        selected.push(doc);
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
          `Norma de baza nu poate fi indeplinita pentru ${doc.name}. Alege cel putin ${requiredLeaveDays} zile de concediu pentru a genera tabelul.`
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
      const leaveDays = this.leaveDays.filter(l => l.doctor_id === doctor.id).length;
      
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
        message: `Prea multe zile de concediu selectate. Maximum permis: ${possibleLeaveDays} zile.`,
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
          message: `Understaffed day shift: only ${dayShiftCount} doctor(s)`,
        });
      }

      if (nightShiftCount < 2) {
        conflicts.push({
          type: 'understaffed',
          date,
          message: `Understaffed night shift: only ${nightShiftCount} doctor(s)`,
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
            message: `Rest violation: Less than ${SCHEDULING_CONSTANTS.DAY_SHIFT_REST} hours after day shift`,
          });
        }

        if (prevShift.shift_type === 'night' && hoursBetween < SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST) {
          conflicts.push({
            type: 'rest_violation',
            date: currShift.shift_date,
            doctor_id: doctorId,
            message: `Rest violation: Less than ${SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST} hours after night shift`,
          });
        }
      }
    });

    return conflicts;
  }
}
