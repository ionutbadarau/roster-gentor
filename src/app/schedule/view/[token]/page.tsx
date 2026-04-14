import { createClient } from '../../../../../supabase/server';
import ReadOnlyScheduleView from '@/components/scheduling/read-only-schedule-view';
import type { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ScheduleViewPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_schedule_by_token', { p_token: token });

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold mb-2">Link expirat sau invalid</h1>
          <p className="text-muted-foreground">
            Acest link a expirat sau nu este valid. Contacteaza administratorul pentru un link nou.
          </p>
        </div>
      </div>
    );
  }

  const schedule = data as {
    token: { doctor_id: string; month: number; year: number; user_id: string };
    doctors: Doctor[];
    teams: Team[];
    shifts: Shift[];
    leave_days: LeaveDay[];
    national_holidays: NationalHoliday[];
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <ReadOnlyScheduleView
        doctors={schedule.doctors ?? []}
        teams={schedule.teams ?? []}
        shifts={schedule.shifts ?? []}
        leaveDays={schedule.leave_days ?? []}
        nationalHolidays={schedule.national_holidays ?? []}
        month={schedule.token.month}
        year={schedule.token.year}
        viewingDoctorId={schedule.token.doctor_id}
      />
    </div>
  );
}
