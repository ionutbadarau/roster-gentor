'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfigurationPanel from './configuration-panel';
import ShiftGridCalendar from './shift-grid-calendar';
import DoctorView from './doctor-view';
import SummaryDashboard from './summary-dashboard';
import { Doctor, Team, Shift, LeaveDay } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Settings, Users, BarChart3, Grid3X3 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const VALID_TABS = ['dashboard', 'grid', 'doctors', 'config'] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function SchedulingDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();

  const tabFromUrl = searchParams.get('tab') as TabValue | null;
  const activeTab: TabValue = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'grid';

  const handleTabChange = useCallback((value: string) => {
    router.replace(`/dashboard?tab=${value}`, { scroll: false });
  }, [router]);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
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
      const [doctorsRes, teamsRes, shiftsRes, leaveDaysRes] = await Promise.all([
        supabase.from('doctors').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('shifts').select('*'),
        supabase.from('leave_days').select('*'),
      ]);

      if (doctorsRes.data) setDoctors(doctorsRes.data);
      if (teamsRes.data) setTeams(teamsRes.data);
      if (shiftsRes.data) setShifts(shiftsRes.data);
      if (leaveDaysRes.data) setLeaveDays(leaveDaysRes.data);
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

  const handleLeaveDaysUpdate = (newLeaveDays: LeaveDay[]) => {
    setLeaveDays(newLeaveDays);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-[100rem]">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{t('scheduling.dashboard.title')}</h1>
        <p className="text-muted-foreground">
          {t('scheduling.dashboard.description')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('scheduling.dashboard.tabDashboard')}</span>
          </TabsTrigger>
          <TabsTrigger value="grid" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('scheduling.dashboard.tabGrid')}</span>
          </TabsTrigger>
          <TabsTrigger value="doctors" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t('scheduling.dashboard.tabDoctors')}</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">{t('scheduling.dashboard.tabConfig')}</span>
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

        <TabsContent value="grid" className="space-y-4">
          <ShiftGridCalendar
            doctors={doctors}
            teams={teams}
            shifts={shifts}
            leaveDays={leaveDays}
            currentMonth={currentMonth}
            currentYear={currentYear}
            onMonthChange={(month, year) => {
              setCurrentMonth(month);
              setCurrentYear(year);
            }}
            onShiftsUpdate={handleScheduleGenerated}
            onLeaveDaysUpdate={handleLeaveDaysUpdate}
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
