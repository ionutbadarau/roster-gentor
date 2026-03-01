'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Plus, Trash2, Users, Save, Settings, Loader2, Pencil, Check, X } from 'lucide-react';
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
  const [newDoctorName, setNewDoctorName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? '');
  const [localShiftsPerDay, setLocalShiftsPerDay] = useState(String(shiftsPerDay));
  const [localShiftsPerNight, setLocalShiftsPerNight] = useState(String(shiftsPerNight));
  const [addingTeam, setAddingTeam] = useState(false);
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
        user_id: userId,
      });

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.teamAddedSuccess'),
      });

      setNewTeamName('');
      setNewTeamColor('#3b82f6');
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

  const handleChangeTeam = async (doctorId: string, newTeamId: string) => {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ team_id: newTeamId || null, is_floating: !newTeamId })
        .eq('id', doctorId);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('scheduling.config.teamChangedSuccess'),
      });
      await onUpdate();
    } catch (error) {
      console.error('Error changing team:', error);
      toast({
        title: t('common.error'),
        description: t('scheduling.config.changeTeamError'),
        variant: 'destructive',
      });
    }
  };

  const handleRenameDoctorOrTeam = async (id: string, type: 'doctor' | 'team') => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      const table = type === 'doctor' ? 'doctors' : 'teams';
      const { error } = await supabase.from(table).update({ name: trimmed }).eq('id', id);
      if (error) throw error;
      toast({
        title: t('common.success'),
        description: t(type === 'doctor' ? 'scheduling.config.doctorRenamedSuccess' : 'scheduling.config.teamRenamedSuccess'),
      });
      await onUpdate();
    } catch (error) {
      console.error(`Error renaming ${type}:`, error);
      toast({
        title: t('common.error'),
        description: t(type === 'doctor' ? 'scheduling.config.doctorRenameError' : 'scheduling.config.teamRenameError'),
        variant: 'destructive',
      });
    } finally {
      setEditingId(null);
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
        .maybeSingle();

      const newConfigData = {
        ...(existing?.config_data as Record<string, unknown> || {}),
        shiftsPerDay: Math.max(1, parseInt(localShiftsPerDay) || 1),
        shiftsPerNight: Math.max(1, parseInt(localShiftsPerNight) || 1),
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
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    {editingId === team.id ? (
                      <Input
                        className="h-7 text-sm"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameDoctorOrTeam(team.id, 'team');
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <p className="font-medium truncate">{team.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingId === team.id ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleRenameDoctorOrTeam(team.id, 'team')}>
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(team.id); setEditingName(team.name); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTeam(team.id)}
                          disabled={deletingId === team.id}
                        >
                          {deletingId === team.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      </>
                    )}
                  </div>
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
              <Label>{t('scheduling.config.assignTeam')}</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    selectedTeamId === ''
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-input bg-background hover:bg-muted'
                  }`}
                  onClick={() => setSelectedTeamId('')}
                >
                  {t('scheduling.config.noTeamOption')}
                </button>
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                      selectedTeamId === team.id
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                    style={{
                      backgroundColor: selectedTeamId === team.id ? `${team.color}20` : undefined,
                    }}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    {team.name}
                  </button>
                ))}
              </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      {team && (
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      {editingId === doctor.id ? (
                        <Input
                          className="h-7 text-sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameDoctorOrTeam(doctor.id, 'doctor');
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <p className="font-medium truncate">{doctor.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="text-xs px-2 py-1 rounded-md border border-input bg-background"
                        value={doctor.team_id || ''}
                        onChange={(e) => handleChangeTeam(doctor.id, e.target.value)}
                      >
                        <option value="">{t('scheduling.config.noTeamOption')}</option>
                        {teams.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name}
                          </option>
                        ))}
                      </select>
                      {editingId === doctor.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleRenameDoctorOrTeam(doctor.id, 'doctor')}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => { setEditingId(doctor.id); setEditingName(doctor.name); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDoctor(doctor.id)}
                            disabled={deletingId === doctor.id}
                          >
                            {deletingId === doctor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                          </Button>
                        </>
                      )}
                    </div>
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
    </div>
  );
}
