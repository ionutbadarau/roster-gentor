import { Doctor, Shift, ScheduleConflict } from '@/types/scheduling';

export interface ScheduleGenerationOptions {
  month: number;
  year: number;
  doctors: Doctor[];
  shiftsPerDay: number;
  shiftsPerNight: number;
}

export class SchedulingEngine {
  private doctors: Doctor[];
  private month: number;
  private year: number;
  private shiftsPerDay: number;
  private shiftsPerNight: number;
  private schedule: Map<string, Shift[]> = new Map();
  private doctorLastShift: Map<string, { date: Date; type: 'day' | 'night' }> = new Map();

  constructor(options: ScheduleGenerationOptions) {
    this.doctors = options.doctors;
    this.month = options.month;
    this.year = options.year;
    this.shiftsPerDay = options.shiftsPerDay;
    this.shiftsPerNight = options.shiftsPerNight;
  }

  generateSchedule(): Shift[] {
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const shifts: Shift[] = [];

    const teamDoctors = this.doctors.filter(d => !d.is_floating);
    const floatingDoctors = this.doctors.filter(d => d.is_floating);
    
    let doctorIndex = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(this.year, this.month, day);
      const dateStr = this.formatDate(currentDate);

      for (let i = 0; i < this.shiftsPerDay; i++) {
        const doctor = this.getNextAvailableDoctor(teamDoctors, floatingDoctors, currentDate, doctorIndex);
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
          doctorIndex = (doctorIndex + 1) % teamDoctors.length;
        }
      }

      for (let i = 0; i < this.shiftsPerNight; i++) {
        const doctor = this.getNextAvailableDoctor(teamDoctors, floatingDoctors, currentDate, doctorIndex);
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
          doctorIndex = (doctorIndex + 1) % teamDoctors.length;
        }
      }
    }

    return shifts;
  }

  private getNextAvailableDoctor(
    teamDoctors: Doctor[],
    floatingDoctors: Doctor[],
    currentDate: Date,
    startIndex: number
  ): Doctor | null {
    // fixme: get next doctor of the same team first, then of the next team (just introduced a `order` column in `teams` table). 
    // floating doctors will be used to fill in gaps and make hours for doctors equal for all

    const allDoctors = [...teamDoctors, ...floatingDoctors];
    
    for (let i = 0; i < allDoctors.length; i++) {
      const index = (startIndex + i) % allDoctors.length;
      const doctor = allDoctors[index];
      
      if (this.canDoctorWork(doctor, currentDate)) {
        return doctor;
      }
    }
    
    return allDoctors[startIndex % allDoctors.length] || null;
  }

  private canDoctorWork(doctor: Doctor, date: Date): boolean {
    const lastShift = this.doctorLastShift.get(doctor.id);
    
    if (!lastShift) return true;

    const hoursSinceLastShift = (date.getTime() - lastShift.date.getTime()) / (1000 * 60 * 60);

    if (lastShift.type === 'day' && hoursSinceLastShift < 24) {
      return false;
    }

    //fixme: night shifts dont respect the 48h pause
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
