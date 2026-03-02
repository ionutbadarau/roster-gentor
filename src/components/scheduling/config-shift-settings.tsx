'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Settings, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';
import { SupabaseClient } from '@supabase/supabase-js';

interface ConfigShiftSettingsProps {
  shiftsPerDay: number;
  shiftsPerNight: number;
  doctorCount: number;
  userId: string | null;
  supabase: SupabaseClient;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigShiftSettings({
  shiftsPerDay,
  shiftsPerNight,
  doctorCount,
  userId,
  supabase,
  onUpdate,
}: ConfigShiftSettingsProps) {
  const [localShiftsPerDay, setLocalShiftsPerDay] = useState(String(shiftsPerDay));
  const [localShiftsPerNight, setLocalShiftsPerNight] = useState(String(shiftsPerNight));
  const [savingSettings, setSavingSettings] = useState(false);

  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSaveShiftSettings = async () => {
    setSavingSettings(true);
    try {
      const { data: existing } = await supabase
        .from('schedule_config')
        .select('id, config_data')
        .limit(1)
        .maybeSingle();

      const newConfigData = {
        ...(existing?.config_data as Record<string, unknown> || {}),
        shiftsPerDay: Math.max(1, parseInt(localShiftsPerDay) || 1),
        shiftsPerNight: Math.max(1, parseInt(localShiftsPerNight) || 1),
      };

      if (existing) {
        const { error } = await supabase.from('schedule_config').update({ config_data: newConfigData }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('schedule_config').insert({ total_doctors: doctorCount, config_data: newConfigData, user_id: userId });
        if (error) throw error;
      }

      toast({ title: t('common.success'), description: t('scheduling.config.shiftSettingsSaved') });
      await onUpdate();
    } catch (error) {
      console.error('Error saving shift settings:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.shiftSettingsSaveError'), variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('scheduling.config.shiftSettingsTitle')}
        </CardTitle>
        <CardDescription>{t('scheduling.config.shiftSettingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-6 flex-wrap">
          <div className="space-y-2">
            <Label htmlFor="shifts-per-day">{t('scheduling.config.doctorsPerDayShift')}</Label>
            <Input
              id="shifts-per-day"
              type="number"
              min="1"
              max="10"
              className="w-24"
              value={localShiftsPerDay}
              onChange={(e) => setLocalShiftsPerDay(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shifts-per-night">{t('scheduling.config.doctorsPerNightShift')}</Label>
            <Input
              id="shifts-per-night"
              type="number"
              min="1"
              max="10"
              className="w-24"
              value={localShiftsPerNight}
              onChange={(e) => setLocalShiftsPerNight(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveShiftSettings} disabled={savingSettings}>
            {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t('scheduling.config.saveShiftSettings')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
