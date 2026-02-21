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

      // Fill all day slots from the same team (team cohesion).
      const dayResult = this.getTeamDoctorsForShift(
        doctorsByTeam, teamIds, currentTeamIndex, currentDate, 'day', this.shiftsPerDay
      );
      for (const doctor of dayResult.doctors) {
        shifts.push({
          id: crypto.randomUUID(),
          doctor_id: doctor.id,
          shift_date: dateStr,
          shift_type: 'day',
          start_time: '08:00',
          end_time: '20:00',
        });
        this.recordShift(doctor, currentDate, 'day');
      }
      if (dayResult.doctors.length > 0) {
        currentTeamIndex = (dayResult.teamIndex + 1) % Math.max(teamIds.length, 1);
      }

      // Fill all night slots from the same team (team cohesion).
      const nightResult = this.getTeamDoctorsForShift(
        doctorsByTeam, teamIds, currentTeamIndex, currentDate, 'night', this.shiftsPerNight
      );
      for (const doctor of nightResult.doctors) {
        shifts.push({
          id: crypto.randomUUID(),
          doctor_id: doctor.id,
          shift_date: dateStr,
          shift_type: 'night',
          start_time: '20:00',
          end_time: '08:00',
        });
        this.recordShift(doctor, currentDate, 'night');
      }
      if (nightResult.doctors.length > 0) {
        currentTeamIndex = (nightResult.teamIndex + 1) % Math.max(teamIds.length, 1);
      }
    }

    this.balanceFloatingDoctors(shifts, floatingDoctors, doctorsByTeam);
    
    const normWarnings = this.checkDoctorNorms();
    if (normWarnings.length > 0) {
      warnings.push(...normWarnings);
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

  // Returns available doctors from a team sorted by cadence preference then fewest hours.
  private getSortedAvailableDoctors(
    teamDoctors: DoctorWithTeam[],
    currentDate: Date,
    shiftType: 'day' | 'night'
  ): DoctorWithTeam[] {
    return [...teamDoctors]
      .filter(doc => this.canDoctorWork(doc, currentDate, shiftType))
      .sort((a, b) => {
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

        return (this.doctorHours.get(a.id) || 0) - (this.doctorHours.get(b.id) || 0);
      });
  }

  // Tries to fill all slotsNeeded from the same team (team cohesion).
  // Falls back to the team with the most available doctors when no single team
  // can cover all slots.
  private getTeamDoctorsForShift(
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    teamIds: string[],
    startTeamIndex: number,
    currentDate: Date,
    shiftType: 'day' | 'night',
    slotsNeeded: number
  ): { doctors: DoctorWithTeam[]; teamIndex: number } {
    // First pass: find a team that can fill every slot.
    for (let t = 0; t < teamIds.length; t++) {
      const teamIndex = (startTeamIndex + t) % teamIds.length;
      const available = this.getSortedAvailableDoctors(
        doctorsByTeam.get(teamIds[teamIndex]) || [],
        currentDate,
        shiftType
      );
      if (available.length >= slotsNeeded) {
        return { doctors: available.slice(0, slotsNeeded), teamIndex };
      }
    }

    // Second pass: no team can cover all slots — pick the one with the most available.
    let bestTeamIndex = startTeamIndex;
    let bestAvailable: DoctorWithTeam[] = [];

    for (let t = 0; t < teamIds.length; t++) {
      const teamIndex = (startTeamIndex + t) % teamIds.length;
      const available = this.getSortedAvailableDoctors(
        doctorsByTeam.get(teamIds[teamIndex]) || [],
        currentDate,
        shiftType
      );
      if (available.length > bestAvailable.length) {
        bestAvailable = available;
        bestTeamIndex = teamIndex;
      }
    }

    return { doctors: bestAvailable, teamIndex: bestTeamIndex };
  }

  private balanceFloatingDoctors(
    shifts: Shift[],
    floatingDoctors: DoctorWithTeam[],
    doctorsByTeam: Map<string, DoctorWithTeam[]>
  ): void {
    if (floatingDoctors.length === 0) return;

    // Track how many shifts each team has donated to floating doctors so that
    // steals are spread equally across all teams.
    const teamDonationCount = new Map<string, number>();
    this.teams.forEach(t => teamDonationCount.set(t.id, 0));

    const sortedFloating = [...floatingDoctors].sort((a, b) =>
      (this.doctorHours.get(a.id) || 0) - (this.doctorHours.get(b.id) || 0)
    );

    for (const floatingDoc of sortedFloating) {
      while ((this.doctorHours.get(floatingDoc.id) || 0) < this.getMinTeamDoctorHours()) {
        const shiftToReplace = this.findShiftToReplace(shifts, floatingDoc, doctorsByTeam, teamDonationCount);

        if (!shiftToReplace) break;

        const originalDoctorId = shiftToReplace.doctor_id;
        const originalDoctor = this.doctors.find(d => d.id === originalDoctorId);
        if (originalDoctor?.team_id) {
          teamDonationCount.set(originalDoctor.team_id, (teamDonationCount.get(originalDoctor.team_id) || 0) + 1);
        }

        shiftToReplace.doctor_id = floatingDoc.id;

        this.doctorHours.set(originalDoctorId, (this.doctorHours.get(originalDoctorId) || 0) - SCHEDULING_CONSTANTS.SHIFT_DURATION);
        this.doctorHours.set(floatingDoc.id, (this.doctorHours.get(floatingDoc.id) || 0) + SCHEDULING_CONSTANTS.SHIFT_DURATION);
        this.doctorShiftCount.set(originalDoctorId, (this.doctorShiftCount.get(originalDoctorId) || 0) - 1);
        this.doctorShiftCount.set(floatingDoc.id, (this.doctorShiftCount.get(floatingDoc.id) || 0) + 1);
      }
    }
  }

  private canFloatingDoctorTakeShift(
    floatingDoc: DoctorWithTeam,
    candidate: Shift,
    shifts: Shift[]
  ): boolean {
    const floatingShifts = shifts
      .filter(s => s.doctor_id === floatingDoc.id)
      .sort((a, b) => new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime());

    const candidateDate = new Date(candidate.shift_date);
    const candidateStart = candidate.shift_type === 'day'
      ? new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate(), 8, 0)
      : new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate(), 20, 0);
    const candidateEnd = candidate.shift_type === 'day'
      ? new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate(), 20, 0)
      : new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate() + 1, 8, 0);

    for (const existing of floatingShifts) {
      const existingDate = new Date(existing.shift_date);
      const existingEnd = existing.shift_type === 'day'
        ? new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate(), 20, 0)
        : new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate() + 1, 8, 0);
      const existingStart = existing.shift_type === 'day'
        ? new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate(), 8, 0)
        : new Date(existingDate.getFullYear(), existingDate.getMonth(), existingDate.getDate(), 20, 0);

      if (existingEnd <= candidateStart) {
        // existing shift ends before candidate starts — check required rest after existing
        const hours = (candidateStart.getTime() - existingEnd.getTime()) / (1000 * 60 * 60);
        const required = existing.shift_type === 'day'
          ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
          : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;
        if (hours < required) return false;
      } else if (existingStart >= candidateEnd) {
        // existing shift starts after candidate ends — check required rest after candidate
        const hours = (existingStart.getTime() - candidateEnd.getTime()) / (1000 * 60 * 60);
        const required = candidate.shift_type === 'day'
          ? SCHEDULING_CONSTANTS.DAY_SHIFT_REST
          : SCHEDULING_CONSTANTS.NIGHT_SHIFT_REST;
        if (hours < required) return false;
      }
    }

    return true;
  }

  private findShiftToReplace(
    shifts: Shift[],
    floatingDoc: DoctorWithTeam,
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    teamDonationCount: Map<string, number>
  ): Shift | null {
    // Prioritise teams that have donated the fewest shifts so far (equal distribution).
    const sortedTeams = [...this.teams].sort((a, b) =>
      (teamDonationCount.get(a.id) || 0) - (teamDonationCount.get(b.id) || 0)
    );

    for (const team of sortedTeams) {
      const teamDocs = (doctorsByTeam.get(team.id) || [])
        .slice()
        .sort((a, b) => (this.doctorHours.get(b.id) || 0) - (this.doctorHours.get(a.id) || 0));

      for (const teamDoc of teamDocs) {
        const teamDocShifts = shifts.filter(s => s.doctor_id === teamDoc.id);

        for (const shift of teamDocShifts) {
          const shiftDate = new Date(shift.shift_date);
          const floatingDocAlreadyWorking = shifts.some(
            s => s.doctor_id === floatingDoc.id && s.shift_date === shift.shift_date
          );
          if (
            !this.isDoctorOnLeave(floatingDoc.id, shiftDate) &&
            !floatingDocAlreadyWorking &&
            this.canFloatingDoctorTakeShift(floatingDoc, shift, shifts)
          ) {
            return shift;
          }
        }
      }
    }

    return null;
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
