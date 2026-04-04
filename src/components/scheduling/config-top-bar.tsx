'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Settings, UserPlus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ConfigTopBarProps {
  shiftsPerDay: number;
  shiftsPerNight: number;
  doctorCount: number;
  onSaveShiftSettings: (shiftsPerDay: number, shiftsPerNight: number, doctorCount: number) => void;
  onAddTeamClick: () => void;
  onAddDoctorClick: () => void;
}

export default function ConfigTopBar({
  shiftsPerDay,
  shiftsPerNight,
  doctorCount,
  onSaveShiftSettings,
  onAddTeamClick,
  onAddDoctorClick,
}: ConfigTopBarProps) {
  const { t } = useTranslation();
  const [localDay, setLocalDay] = useState(String(shiftsPerDay));
  const [localNight, setLocalNight] = useState(String(shiftsPerNight));
  const prevDayRef = useRef(shiftsPerDay);
  const prevNightRef = useRef(shiftsPerNight);

  useEffect(() => {
    setLocalDay(String(shiftsPerDay));
    setLocalNight(String(shiftsPerNight));
    prevDayRef.current = shiftsPerDay;
    prevNightRef.current = shiftsPerNight;
  }, [shiftsPerDay, shiftsPerNight]);

  const handleBlur = () => {
    const newDay = Math.max(1, parseInt(localDay) || 1);
    const newNight = Math.max(1, parseInt(localNight) || 1);
    if (newDay !== prevDayRef.current || newNight !== prevNightRef.current) {
      prevDayRef.current = newDay;
      prevNightRef.current = newNight;
      onSaveShiftSettings(newDay, newNight, doctorCount);
    }
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-4 flex-wrap">
        <Settings className="h-4 w-4 text-muted-foreground" />

        <div className="flex items-center gap-2">
          <Label htmlFor="topbar-day" className="text-sm whitespace-nowrap">
            {t('scheduling.config.doctorsPerDayShift')}:
          </Label>
          <Input
            id="topbar-day"
            type="number"
            min="1"
            max="10"
            className="h-8 w-16 text-center"
            value={localDay}
            onChange={(e) => setLocalDay(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="topbar-night" className="text-sm whitespace-nowrap">
            {t('scheduling.config.doctorsPerNightShift')}:
          </Label>
          <Input
            id="topbar-night"
            type="number"
            min="1"
            max="10"
            className="h-8 w-16 text-center"
            value={localNight}
            onChange={(e) => setLocalNight(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onAddTeamClick}>
          <Plus className="h-4 w-4 mr-1" />
          {t('scheduling.config.addTeam')}
        </Button>
        <Button variant="outline" size="sm" onClick={onAddDoctorClick}>
          <UserPlus className="h-4 w-4 mr-1" />
          {t('scheduling.config.addDoctor')}
        </Button>
      </div>
    </div>
  );
}
