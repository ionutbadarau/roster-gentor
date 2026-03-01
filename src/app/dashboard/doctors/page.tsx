'use client';

import { useState } from 'react';
import DoctorView from '@/components/scheduling/doctor-view';
import { useDoctors, useTeams, useShifts } from '@/lib/queries';
import type { Doctor } from '@/types/scheduling';

export default function DoctorsPage() {
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [currentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());

  const { data: doctors = [], isLoading: loadingDoctors } = useDoctors();
  const { data: teams = [], isLoading: loadingTeams } = useTeams();
  const { data: shifts = [], isLoading: loadingShifts } = useShifts();

  const loading = loadingDoctors || loadingTeams || loadingShifts;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DoctorView
        doctors={doctors}
        teams={teams}
        shifts={shifts}
        selectedDoctor={selectedDoctor}
        onDoctorSelect={setSelectedDoctor}
        currentMonth={currentMonth}
        currentYear={currentYear}
      />
    </div>
  );
}
