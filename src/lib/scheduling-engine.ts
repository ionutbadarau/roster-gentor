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
  private schedule: Map<string, Shift[]> = new Map();
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
    return SCHEDULING_CONSTANTS.BASE_NORM_HOURS_PER_DAY * (workingDays - doctorLeaveDays);
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

  private getMinTeamDoctorHours(): number {
    const teamDoctors = this.doctors.filter(d => !d.is_floating);
    if (teamDoctors.length === 0) return 0;
    
    return Math.min(...teamDoctors.map(d => this.doctorHours.get(d.id) || 0));
  }

  generateSchedule(): ScheduleGenerationResult {
    const daysInMonth = this.getDaysInMonth();
    const shifts: Shift[] = [];
    const warnings: string[] = [];

    const doctorsByTeam = new Map<string, DoctorWithTeam[]>();
    const floatingDoctors = this.doctors.filter(d => d.is_floating);
    
    this.teams.forEach(team => {
      doctorsByTeam.set(team.id, []);
    });
    
    this.doctors.filter(d => !d.is_floating && d.team_id).forEach(doctor => {
      const teamDoctors = doctorsByTeam.get(doctor.team_id!);
      if (teamDoctors) {
        teamDoctors.push(doctor);
      }
    });

    this.doctors.forEach(d => {
      this.doctorShiftCount.set(d.id, 0);
      this.doctorHours.set(d.id, 0);
      this.doctorWeeklyHours.set(d.id, new Map());
    });
    
    let currentTeamIndex = 0;
    const teamIds = this.teams.map(t => t.id);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      for (let i = 0; i < this.shiftsPerDay; i++) {
        const doctor = this.getNextAvailableTeamDoctor(
          doctorsByTeam,
          teamIds,
          currentTeamIndex,
          currentDate,
          'day'
        );
        if (doctor) {
          shifts.push({
            id: crypto.randomUUID(),
            doctor_id: doctor.id,
            shift_date: dateStr,
            shift_type: 'day',
            start_time: '08:00',
            end_time: '20:00',
          });
          this.recordShift(doctor, currentDate, 'day');
          currentTeamIndex = (currentTeamIndex + 1) % Math.max(teamIds.length, 1);
        }
      }

      for (let i = 0; i < this.shiftsPerNight; i++) {
        const doctor = this.getNextAvailableTeamDoctor(
          doctorsByTeam,
          teamIds,
          currentTeamIndex,
          currentDate,
          'night'
        );
        if (doctor) {
          shifts.push({
            id: crypto.randomUUID(),
            doctor_id: doctor.id,
            shift_date: dateStr,
            shift_type: 'night',
            start_time: '20:00',
            end_time: '08:00',
          });
          this.recordShift(doctor, currentDate, 'night');
          currentTeamIndex = (currentTeamIndex + 1) % Math.max(teamIds.length, 1);
        }
      }
    }

    this.balanceFloatingDoctors(shifts, floatingDoctors, doctorsByTeam);
    
    const floatingDoctorIssues = this.checkFloatingDoctorNorms(floatingDoctors);
    if (floatingDoctorIssues.length > 0) {
      warnings.push(...floatingDoctorIssues);
    }

    this.applyShiftRounding(shifts);

    const conflicts = SchedulingEngine.detectConflicts(shifts, this.doctors);
    const doctorStats = this.calculateDoctorStats();

    return {
      shifts,
      conflicts,
      warnings,
      doctorStats,
    };
  }

  private getNextAvailableTeamDoctor(
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    teamIds: string[],
    startTeamIndex: number,
    currentDate: Date,
    shiftType: 'day' | 'night'
  ): DoctorWithTeam | null {
    for (let t = 0; t < teamIds.length; t++) {
      const teamIndex = (startTeamIndex + t) % teamIds.length;
      const teamId = teamIds[teamIndex];
      const teamDoctors = doctorsByTeam.get(teamId) || [];
      
      const sortedTeamDoctors = [...teamDoctors].sort((a, b) => {
        const aHours = this.doctorHours.get(a.id) || 0;
        const bHours = this.doctorHours.get(b.id) || 0;
        
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
        
        return aHours - bHours;
      });
      
      for (const doctor of sortedTeamDoctors) {
        if (this.canDoctorWork(doctor, currentDate, shiftType)) {
          return doctor;
        }
      }
    }
    
    return null;
  }

  private balanceFloatingDoctors(
    shifts: Shift[],
    floatingDoctors: DoctorWithTeam[],
    doctorsByTeam: Map<string, DoctorWithTeam[]>
  ): void {
    if (floatingDoctors.length === 0) return;

    const sortedFloating = [...floatingDoctors].sort((a, b) => 
      (this.doctorHours.get(a.id) || 0) - (this.doctorHours.get(b.id) || 0)
    );

    for (const floatingDoc of sortedFloating) {
      while ((this.doctorHours.get(floatingDoc.id) || 0) < this.getMinTeamDoctorHours()) {
        const shiftToReplace = this.findShiftToReplace(shifts, floatingDoc, doctorsByTeam);
        
        if (!shiftToReplace) break;
        
        const originalDoctorId = shiftToReplace.doctor_id;
        shiftToReplace.doctor_id = floatingDoc.id;
        
        this.doctorHours.set(originalDoctorId, (this.doctorHours.get(originalDoctorId) || 0) - SCHEDULING_CONSTANTS.SHIFT_DURATION);
        this.doctorHours.set(floatingDoc.id, (this.doctorHours.get(floatingDoc.id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
        this.doctorShiftCount.set(originalDoctorId, (this.doctorShiftCount.get(originalDoctorId) || 0) - 1);
        this.doctorShiftCount.set(floatingDoc.id, (this.doctorShiftCount.get(floatingDoc.id) || 0) + 1);
      }
    }
  }

  private findShiftToReplace(
    shifts: Shift[],
    floatingDoc: DoctorWithTeam,
    doctorsByTeam: Map<string, DoctorWithTeam[]>
  ): Shift | null {
    const teamDoctors = this.doctors.filter(d => !d.is_floating);
    const sortedByHours = [...teamDoctors].sort((a, b) => 
      (this.doctorHours.get(b.id) || 0) - (this.doctorHours.get(a.id) || 0)
    );

    for (const teamDoc of sortedByHours) {
      const teamDocShifts = shifts.filter(s => s.doctor_id === teamDoc.id);
      
      for (const shift of teamDocShifts) {
        const shiftDate = new Date(shift.shift_date);
        
        if (!this.isDoctorOnLeave(floatingDoc.id, shiftDate)) {
          return shift;
        }
      }
    }

    return null;
  }

  private checkFloatingDoctorNorms(floatingDoctors: DoctorWithTeam[]): string[] {
    const warnings: string[] = [];
    
    for (const doc of floatingDoctors) {
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
