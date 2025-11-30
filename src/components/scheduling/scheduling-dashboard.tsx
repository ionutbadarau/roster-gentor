'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import ConfigurationPanel from './configuration-panel';
import MonthlyCalendar from './monthly-calendar';
import DoctorView from './doctor-view';
import SummaryDashboard from './summary-dashboard';
import { Doctor, Team, Shift } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Calendar, Settings, Users, BarChart3 } from 'lucide-react';

export default function SchedulingDashboard() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [doctorsRes, teamsRes, shiftsRes] = await Promise.all([
        supabase.from('doctors').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('shifts').select('*'),
      ]);

      if (doctorsRes.data) setDoctors(doctorsRes.data);
      if (teamsRes.data) setTeams(teamsRes.data);
      if (shiftsRes.data) setShifts(shiftsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigUpdate = () => {
    loadData();
  };

  const handleScheduleGenerated = (newShifts: Shift[]) => {
    setShifts(newShifts);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading schedule data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Doctor Shift Planning</h1>
        <p className="text-muted-foreground">
          Manage medical staff schedules with automated shift generation and conflict detection
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="doctors" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Doctors</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Configuration</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <SummaryDashboard
            doctors={doctors}
            teams={teams}
            shifts={shifts}
            currentMonth={currentMonth}
            currentYear={currentYear}
          />
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <MonthlyCalendar
            doctors={doctors}
            teams={teams}
            shifts={shifts}
            currentMonth={currentMonth}
            currentYear={currentYear}
            onMonthChange={(month, year) => {
              setCurrentMonth(month);
              setCurrentYear(year);
            }}
            onShiftsUpdate={handleScheduleGenerated}
          />
        </TabsContent>

        <TabsContent value="doctors" className="space-y-4">
          <DoctorView
            doctors={doctors}
            teams={teams}
            shifts={shifts}
            selectedDoctor={selectedDoctor}
            onDoctorSelect={setSelectedDoctor}
            currentMonth={currentMonth}
            currentYear={currentYear}
          />
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <ConfigurationPanel
            doctors={doctors}
            teams={teams}
            onUpdate={handleConfigUpdate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
