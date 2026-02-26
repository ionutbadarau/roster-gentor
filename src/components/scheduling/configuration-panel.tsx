'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Plus, Trash2, Users, Save, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';

interface ConfigurationPanelProps {
  doctors: Doctor[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  userId: string | null;
  onUpdate: () => void;
}

export default function ConfigurationPanel({ doctors, teams, shiftsPerDay, shiftsPerNight, userId, onUpdate }: ConfigurationPanelProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6');
  const [newTeamMaxMembers, setNewTeamMaxMembers] = useState(3);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isFloating, setIsFloating] = useState(false);
  const [localShiftsPerDay, setLocalShiftsPerDay] = useState(shiftsPerDay);
  const [localShiftsPerNight, setLocalShiftsPerNight] = useState(shiftsPerNight);
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
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
      onUpdate();
    } catch (error) {
      console.error('Error adding team:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.teamAddError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.teamDeletedSuccess'),
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.teamDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

    setLoading(true);
    try {
      const { error } = await supabase.from('doctors').insert({
        name: newDoctorName,
        email: newDoctorEmail || null,
        team_id: selectedTeamId || null,
        is_floating: isFloating,
        user_id: userId,
      });

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.doctorAddedSuccess'),
      });

      setNewDoctorName('');
      setNewDoctorEmail('');
      setSelectedTeamId('');
      setIsFloating(false);
      onUpdate();
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.doctorAddError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('doctors').delete().eq('id', doctorId);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.doctorDeletedSuccess'),
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.doctorDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveShiftSettings = async () => {
    setLoading(true);
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
      onUpdate();
    } catch (error) {
      console.error('Error saving shift settings:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.shiftSettingsSaveError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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
            <Button onClick={handleSaveShiftSettings} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
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

            <Button onClick={handleAddTeam} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
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
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
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
              <Label htmlFor="doctor-email">{t('scheduling.config.doctorEmail')}</Label>
              <Input
                id="doctor-email"
                type="email"
                placeholder={t('scheduling.config.doctorEmailPlaceholder')}
                value={newDoctorEmail}
                onChange={(e) => setNewDoctorEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-select">{t('scheduling.config.assignTeam')}</Label>
              <select
                id="team-select"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                disabled={isFloating}
              >
                <option value="">{t('scheduling.config.noTeamOption')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label htmlFor="floating-switch">{t('scheduling.config.floatingStaff')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('scheduling.config.floatingStaffDesc')}
                </p>
              </div>
              <Switch
                id="floating-switch"
                checked={isFloating}
                onCheckedChange={(checked) => {
                  setIsFloating(checked);
                  if (checked) setSelectedTeamId('');
                }}
              />
            </div>

            <Button onClick={handleAddDoctor} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
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
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
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
