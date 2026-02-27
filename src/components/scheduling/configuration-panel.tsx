'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Plus, Trash2, Users, Save, Settings, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';

interface ConfigurationPanelProps {
  doctors: Doctor[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  userId: string | null;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigurationPanel({ doctors, teams, shiftsPerDay, shiftsPerNight, userId, onUpdate }: ConfigurationPanelProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6');
  const [newTeamMaxMembers, setNewTeamMaxMembers] = useState(3);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [localShiftsPerDay, setLocalShiftsPerDay] = useState(shiftsPerDay);
  const [localShiftsPerNight, setLocalShiftsPerNight] = useState(shiftsPerNight);
  const [addingTeam, setAddingTeam] = useState(false);
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      toast({
        title: t('common.error'),
        description: t('scheduling.config.teamNameRequired'),
        variant: 'destructive',
      });
      return;
    }

    setAddingTeam(true);
    try {
      const { error } = await supabase.from('teams').insert({
        name: newTeamName,
        color: newTeamColor,
        max_members: newTeamMaxMembers,
        user_id: userId,
      });

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.teamAddedSuccess'),
      });

      setNewTeamName('');
      setNewTeamColor('#3b82f6');
      setNewTeamMaxMembers(3);
      await onUpdate();
    } catch (error) {
      console.error('Error adding team:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.teamAddError'),
        variant: 'destructive',
      });
    } finally {
      setAddingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setDeletingId(teamId);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.teamDeletedSuccess'),
      });

      await onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.teamDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddDoctor = async () => {
    if (!newDoctorName.trim()) {
      toast({
        title: t('common.error'),
        description: t('scheduling.config.doctorNameRequired'),
        variant: 'destructive',
      });
      return;
    }

    setAddingDoctor(true);
    try {
      const { error } = await supabase.from('doctors').insert({
        name: newDoctorName,
        email: null,
        team_id: selectedTeamId || null,
        is_floating: !selectedTeamId,
        user_id: userId,
      });

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.doctorAddedSuccess'),
      });

      setNewDoctorName('');
      setSelectedTeamId('');
      await onUpdate();
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.doctorAddError'),
        variant: 'destructive',
      });
    } finally {
      setAddingDoctor(false);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    setDeletingId(doctorId);
    try {
      const { error } = await supabase.from('doctors').delete().eq('id', doctorId);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.doctorDeletedSuccess'),
      });

      await onUpdate();
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.doctorDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveShiftSettings = async () => {
    setSavingSettings(true);
    try {
      // Upsert: check if a config row exists, update or insert
      const { data: existing } = await supabase
        .from('schedule_config')
        .select('id, config_data')
        .limit(1)
        .single();

      const newConfigData = {
        ...(existing?.config_data as Record<string, unknown> || {}),
        shiftsPerDay: localShiftsPerDay,
        shiftsPerNight: localShiftsPerNight,
      };

      if (existing) {
        const { error } = await supabase
          .from('schedule_config')
          .update({ config_data: newConfigData })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('schedule_config')
          .insert({ total_doctors: doctors.length, config_data: newConfigData, user_id: userId });
        if (error) throw error;
      }

      toast({
        title: t('common.success'),
        description: t('scheduling.config.shiftSettingsSaved'),
      });
      await onUpdate();
    } catch (error) {
      console.error('Error saving shift settings:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.shiftSettingsSaveError'),
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const teamColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('scheduling.config.shiftSettingsTitle')}
          </CardTitle>
          <CardDescription>
            {t('scheduling.config.shiftSettingsDesc')}
          </CardDescription>
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
                onChange={(e) => setLocalShiftsPerDay(parseInt(e.target.value) || 1)}
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
                onChange={(e) => setLocalShiftsPerNight(parseInt(e.target.value) || 1)}
              />
            </div>
            <Button onClick={handleSaveShiftSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t('scheduling.config.saveShiftSettings')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('scheduling.config.teamsTitle')}
          </CardTitle>
          <CardDescription>
            {t('scheduling.config.teamsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">{t('scheduling.config.teamName')}</Label>
              <Input
                id="team-name"
                placeholder={t('scheduling.config.teamNamePlaceholder')}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('scheduling.config.teamColor')}</Label>
              <div className="flex gap-2">
                {teamColors.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newTeamColor === color ? 'border-primary scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTeamColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-members">{t('scheduling.config.maxMembers')}</Label>
              <Input
                id="max-members"
                type="number"
                min="1"
                max="10"
                value={newTeamMaxMembers}
                onChange={(e) => setNewTeamMaxMembers(parseInt(e.target.value) || 3)}
              />
            </div>

            <Button onClick={handleAddTeam} disabled={addingTeam} className="w-full">
              {addingTeam ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t('scheduling.config.addTeam')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.config.existingTeams')} ({teams.length})</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('scheduling.config.maxMembersLabel', { count: team.max_members })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={deletingId === team.id}
                  >
                    {deletingId === team.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('scheduling.config.noTeams')}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('scheduling.config.doctorsTitle')}
          </CardTitle>
          <CardDescription>
            {t('scheduling.config.doctorsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doctor-name">{t('scheduling.config.doctorName')}</Label>
              <Input
                id="doctor-name"
                placeholder={t('scheduling.config.doctorNamePlaceholder')}
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-select">{t('scheduling.config.assignTeam')}</Label>
              <select
                id="team-select"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                <option value="">{t('scheduling.config.noTeamOption')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleAddDoctor} disabled={addingDoctor} className="w-full">
              {addingDoctor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t('scheduling.config.addDoctor')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.config.doctorsLabel')} ({doctors.length})</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {doctors.map((doctor) => {
                const team = teams.find((t) => t.id === doctor.team_id);
                return (
                  <div
                    key={doctor.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      {team && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      <div>
                        <p className="font-medium">{doctor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doctor.is_floating
                            ? t('scheduling.config.floatingLabel')
                            : team
                            ? team.name
                            : t('scheduling.config.noTeamLabel')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDoctor(doctor.id)}
                      disabled={deletingId === doctor.id}
                    >
                      {deletingId === doctor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </div>
                );
              })}
              {doctors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('scheduling.config.noDoctors')}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
