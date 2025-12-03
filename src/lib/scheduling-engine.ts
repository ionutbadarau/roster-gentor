import { Doctor, Shift, ScheduleConflict, Team, DoctorWithTeam } from '@/types/scheduling';

export interface ScheduleGenerationOptions {
  month: number;
  year: number;
  doctors: DoctorWithTeam[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
}

export class SchedulingEngine {
  private doctors: DoctorWithTeam[];
  private teams: Team[];
  private month: number;
  private year: number;
  private shiftsPerDay: number;
  private shiftsPerNight: number;
  private schedule: Map<string, Shift[]> = new Map();
  private doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' }> = new Map();
  private doctorShiftCount: Map<string, number> = new Map();

  constructor(options: ScheduleGenerationOptions) {
    this.doctors = options.doctors;
    this.teams = options.teams.sort((a, b) => a.order - b.order);
    this.month = options.month;
    this.year = options.year;
    this.shiftsPerDay = options.shiftsPerDay;
    this.shiftsPerNight = options.shiftsPerNight;
  }

  generateSchedule(): Shift[] {
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const shifts: Shift[] = [];

    // Group doctors by team, sorted by team order
    const doctorsByTeam = new Map<string, DoctorWithTeam[]>();
    const floatingDoctors = this.doctors.filter(d => d.is_floating);
    
    // Initialize doctorsByTeam for each team in order
    this.teams.forEach(team => {
      doctorsByTeam.set(team.id, []);
    });
    
    // Assign doctors to their teams
    this.doctors.filter(d => !d.is_floating && d.team_id).forEach(doctor => {
      const teamDoctors = doctorsByTeam.get(doctor.team_id!);
      if (teamDoctors) {
        teamDoctors.push(doctor);
      }
    });

    // Initialize shift counts for all doctors
    this.doctors.forEach(d => this.doctorShiftCount.set(d.id, 0));
    
    let currentTeamIndex = 0;
    const teamIds = this.teams.map(t => t.id);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      // Assign day shifts
      for (let i = 0; i < this.shiftsPerDay; i++) {
        const doctor = this.getNextAvailableDoctor(
          doctorsByTeam,
          floatingDoctors,
          teamIds,
          currentTeamIndex,
          currentDate
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
          this.doctorLastShift.set(doctor.id, { date: currentDate, type: 'day' });
          this.doctorShiftCount.set(doctor.id, (this.doctorShiftCount.get(doctor.id) || 0) + 1);
          currentTeamIndex = (currentTeamIndex + 1) % teamIds.length;
        }
      }

      // Assign night shifts
      for (let i = 0; i < this.shiftsPerNight; i++) {
        const doctor = this.getNextAvailableDoctor(
          doctorsByTeam,
          floatingDoctors,
          teamIds,
          currentTeamIndex,
          currentDate
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
          this.doctorLastShift.set(doctor.id, { date: currentDate, type: 'night' });
          this.doctorShiftCount.set(doctor.id, (this.doctorShiftCount.get(doctor.id) || 0) + 1);
          currentTeamIndex = (currentTeamIndex + 1) % teamIds.length;
        }
      }
    }

    return shifts;
  }

  private getNextAvailableDoctor(
    doctorsByTeam: Map<string, DoctorWithTeam[]>,
    floatingDoctors: DoctorWithTeam[],
    teamIds: string[],
    startTeamIndex: number,
    currentDate: Date
  ): DoctorWithTeam | null {
    // First, try to find an available doctor from teams in order
    for (let t = 0; t < teamIds.length; t++) {
      const teamIndex = (startTeamIndex + t) % teamIds.length;
      const teamId = teamIds[teamIndex];
      const teamDoctors = doctorsByTeam.get(teamId) || [];
      
      // Sort team doctors by shift count to balance hours
      const sortedTeamDoctors = [...teamDoctors].sort((a, b) => 
        (this.doctorShiftCount.get(a.id) || 0) - (this.doctorShiftCount.get(b.id) || 0)
      );
      
      for (const doctor of sortedTeamDoctors) {
        if (this.canDoctorWork(doctor, currentDate)) {
          return doctor;
        }
      }
    }
    
    // If no team doctor is available, use floating doctors to fill gaps
    // Sort floating doctors by shift count to equalize hours
    const sortedFloatingDoctors = [...floatingDoctors].sort((a, b) => 
      (this.doctorShiftCount.get(a.id) || 0) - (this.doctorShiftCount.get(b.id) || 0)
    );
    
    for (const doctor of sortedFloatingDoctors) {
      if (this.canDoctorWork(doctor, currentDate)) {
        return doctor;
      }
    }
    
    // Fallback: return any available doctor
    const allDoctors = [...this.doctors].sort((a, b) => 
      (this.doctorShiftCount.get(a.id) || 0) - (this.doctorShiftCount.get(b.id) || 0)
    );
    
    return allDoctors.find(d => this.canDoctorWork(d, currentDate)) || null;
  }

  private canDoctorWork(doctor: DoctorWithTeam, date: Date): boolean {
    const lastShift = this.doctorLastShift.get(doctor.id);
    
    if (!lastShift) return true;

    const hoursSinceLastShift = (date.getTime() - lastShift.date.getTime()) / (1000 * 60 * 60);

    // 24 hours mandatory rest after day shifts
    if (lastShift.type === 'day' && hoursSinceLastShift < 24) {
      return false;
    }

    // 48 hours mandatory rest after night shifts
    if (lastShift.type === 'night' && hoursSinceLastShift < 48) {
      return false;
    }

    return true;
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

        if (prevShift.shift_type === 'day' && hoursBetween < 24) {
          conflicts.push({
            type: 'rest_violation',
            date: currShift.shift_date,
            doctor_id: doctorId,
            message: `Rest violation: Less than 24 hours after day shift`,
          });
        }

        if (prevShift.shift_type === 'night' && hoursBetween < 48) {
          conflicts.push({
            type: 'rest_violation',
            date: currShift.shift_date,
            doctor_id: doctorId,
            message: `Rest violation: Less than 48 hours after night shift`,
          });
        }
      }
    });

    return conflicts;
  }
}
