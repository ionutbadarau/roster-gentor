'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Doctor, Team } from '@/types/scheduling';
import { Plus, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';
import { SupabaseClient } from '@supabase/supabase-js';
import InlineEditableItem from './inline-editable-item';

interface ConfigDoctorsSectionProps {
  doctors: Doctor[];
  teams: Team[];
  userId: string | null;
  supabase: SupabaseClient;
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onConfirmEdit: (id: string, type: 'doctor') => void;
  onSetDeletingId: (id: string | null) => void;
  onEditingNameChange: (name: string) => void;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigDoctorsSection({
  doctors,
  teams,
  userId,
  supabase,
  editingId,
  editingName,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onSetDeletingId,
  onEditingNameChange,
  onUpdate,
}: ConfigDoctorsSectionProps) {
  const [newDoctorName, setNewDoctorName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? '');
  const [addingDoctor, setAddingDoctor] = useState(false);

  const { toast } = useToast();
  const { t } = useTranslation();

  const handleAddDoctor = async () => {
    if (!newDoctorName.trim()) {
      toast({ title: t('common.error'), description: t('scheduling.config.doctorNameRequired'), variant: 'destructive' });
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

      toast({ title: t('common.success'), description: t('scheduling.config.doctorAddedSuccess') });
      setNewDoctorName('');
      await onUpdate();
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.doctorAddError'), variant: 'destructive' });
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

      toast({ title: t('common.success'), description: t('scheduling.config.teamChangedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error changing team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.changeTeamError'), variant: 'destructive' });
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    onSetDeletingId(doctorId);
    try {
      const { error } = await supabase.from('doctors').delete().eq('id', doctorId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.doctorDeletedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.doctorDeleteError'), variant: 'destructive' });
    } finally {
      onSetDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('scheduling.config.doctorsTitle')}
        </CardTitle>
        <CardDescription>{t('scheduling.config.doctorsDesc')}</CardDescription>
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
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
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
                <InlineEditableItem
                  key={doctor.id}
                  id={doctor.id}
                  name={doctor.name}
                  editingId={editingId}
                  editingName={editingName}
                  deletingId={deletingId}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onConfirmEdit={(id) => onConfirmEdit(id, 'doctor')}
                  onDelete={handleDeleteDoctor}
                  onEditingNameChange={onEditingNameChange}
                  prefix={
                    team ? <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} /> : undefined
                  }
                  extra={
                    <select
                      className="text-xs px-2 py-1 rounded-md border border-input bg-background"
                      value={doctor.team_id || ''}
                      onChange={(e) => handleChangeTeam(doctor.id, e.target.value)}
                    >
                      <option value="">{t('scheduling.config.noTeamOption')}</option>
                      {teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>{tm.name}</option>
                      ))}
                    </select>
                  }
                />
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
  );
}
