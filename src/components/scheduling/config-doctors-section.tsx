'use client';

import { useState, useRef, useCallback } from 'react';
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
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const { toast } = useToast();
  const { t } = useTranslation();

  // Sort doctors by display_order for rendering
  const sortedDoctors = [...doctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const handleReorder = useCallback(async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = [...sortedDoctors];
    const fromIndex = ordered.findIndex(d => d.id === fromId);
    const toIndex = ordered.findIndex(d => d.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    // Persist new order
    try {
      const updates = ordered.map((d, i) =>
        supabase.from('doctors').update({ display_order: i }).eq('id', d.id)
      );
      await Promise.all(updates);
      await onUpdate();
    } catch (error) {
      console.error('Error reordering doctors:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.reorderError'), variant: 'destructive' });
    }
  }, [sortedDoctors, supabase, onUpdate, toast, t]);

  const handleAddDoctor = async () => {
    if (!newDoctorName.trim()) {
      toast({ title: t('common.error'), description: t('scheduling.config.doctorNameRequired'), variant: 'destructive' });
      return;
    }

    setAddingDoctor(true);
    try {
      const maxOrder = doctors.reduce((max, d) => Math.max(max, d.display_order ?? 0), 0);
      const { error } = await supabase.from('doctors').insert({
        name: newDoctorName,
        email: null,
        team_id: selectedTeamId || null,
        is_floating: !selectedTeamId,
        user_id: userId,
        display_order: maxOrder + 1,
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

  const handleChangeShiftMode = async (doctorId: string, mode: '12h' | '24h') => {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ shift_mode: mode })
        .eq('id', doctorId);
      if (error) throw error;

      toast({ title: t('common.success'), description: t('scheduling.config.shiftModeChangedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error changing shift mode:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.shiftModeChangeError'), variant: 'destructive' });
    }
  };

  const handleToggleOptional = async (doctorId: string, isOptional: boolean) => {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ is_optional: isOptional })
        .eq('id', doctorId);
      if (error) throw error;

      toast({ title: t('common.success'), description: t('scheduling.config.optionalChangedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error toggling optional:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.optionalChangeError'), variant: 'destructive' });
    }
  };

  const handleToggleDispatch = async (doctorId: string, canDispatch: boolean) => {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ can_dispatch: canDispatch })
        .eq('id', doctorId);
      if (error) throw error;

      toast({ title: t('common.success'), description: t('scheduling.config.dispatchChangedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error toggling dispatch:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.dispatchChangeError'), variant: 'destructive' });
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
          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {sortedDoctors.map((doctor) => {
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
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: (e) => {
                      draggedIdRef.current = doctor.id;
                      e.dataTransfer.effectAllowed = 'move';
                    },
                    onDragEnd: () => {
                      draggedIdRef.current = null;
                      setDragOverId(null);
                    },
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverId(doctor.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    if (draggedIdRef.current) {
                      handleReorder(draggedIdRef.current, doctor.id);
                    }
                  }}
                  isDragOver={dragOverId === doctor.id}
                  prefix={
                    team ? <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} /> : undefined
                  }
                  extra={
                    <div className="flex items-center gap-1.5">
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
                      <select
                        className="text-xs px-2 py-1 rounded-md border border-input bg-background"
                        value={doctor.shift_mode || '12h'}
                        onChange={(e) => handleChangeShiftMode(doctor.id, e.target.value as '12h' | '24h')}
                      >
                        <option value="12h">12h</option>
                        <option value="24h">24h</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doctor.is_optional ?? false}
                          onChange={(e) => handleToggleOptional(doctor.id, e.target.checked)}
                          className="rounded border-input"
                        />
                        {t('scheduling.config.optionalLabel')}
                      </label>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doctor.can_dispatch ?? false}
                          onChange={(e) => handleToggleDispatch(doctor.id, e.target.checked)}
                          className="rounded border-input"
                        />
                        {t('scheduling.config.dispatchLabel')}
                      </label>
                    </div>
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
