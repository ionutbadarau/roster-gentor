'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Team } from '@/types/scheduling';
import { Plus, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';
import { SupabaseClient } from '@supabase/supabase-js';
import InlineEditableItem from './inline-editable-item';

const TEAM_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
];

interface ConfigTeamsSectionProps {
  teams: Team[];
  userId: string | null;
  supabase: SupabaseClient;
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onConfirmEdit: (id: string, type: 'team') => void;
  onSetDeletingId: (id: string | null) => void;
  onEditingNameChange: (name: string) => void;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigTeamsSection({
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
}: ConfigTeamsSectionProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6');
  const [addingTeam, setAddingTeam] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const { toast } = useToast();
  const { t } = useTranslation();

  const sortedTeams = [...teams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleReorder = useCallback(async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = [...sortedTeams];
    const fromIndex = ordered.findIndex(t => t.id === fromId);
    const toIndex = ordered.findIndex(t => t.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    try {
      for (let i = 0; i < ordered.length; i++) {
        await supabase.from('teams').update({ order: i + 1 }).eq('id', ordered[i].id);
      }
      await onUpdate();
    } catch (error) {
      console.error('Error reordering teams:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.reorderError'), variant: 'destructive' });
    }
  }, [sortedTeams, supabase, onUpdate, toast, t]);

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      toast({ title: t('common.error'), description: t('scheduling.config.teamNameRequired'), variant: 'destructive' });
      return;
    }

    setAddingTeam(true);
    try {
      const maxOrder = teams.reduce((max, t) => Math.max(max, t.order ?? 0), 0);
      const { error } = await supabase.from('teams').insert({ name: newTeamName, color: newTeamColor, user_id: userId, order: maxOrder + 1 });
      if (error) throw error;

      toast({ title: t('common.success'), description: t('scheduling.config.teamAddedSuccess') });
      setNewTeamName('');
      setNewTeamColor('#3b82f6');
      await onUpdate();
    } catch (error) {
      console.error('Error adding team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.teamAddError'), variant: 'destructive' });
    } finally {
      setAddingTeam(false);
    }
  };

  const handleToggleMaxPerShift = async (teamId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('teams')
        .update({ max_doctors_per_shift: enabled ? 1 : null })
        .eq('id', teamId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.maxPerShiftChanged') });
      await onUpdate();
    } catch (error) {
      console.error('Error updating max doctors per shift:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.maxPerShiftError'), variant: 'destructive' });
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    onSetDeletingId(teamId);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.teamDeletedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.teamDeleteError'), variant: 'destructive' });
    } finally {
      onSetDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('scheduling.config.teamsTitle')}
        </CardTitle>
        <CardDescription>{t('scheduling.config.teamsDesc')}</CardDescription>
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
              {TEAM_COLORS.map((color) => (
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
            {sortedTeams.map((team) => (
              <InlineEditableItem
                key={team.id}
                id={team.id}
                name={team.name}
                editingId={editingId}
                editingName={editingName}
                deletingId={deletingId}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onConfirmEdit={(id) => onConfirmEdit(id, 'team')}
                onDelete={handleDeleteTeam}
                onEditingNameChange={onEditingNameChange}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e) => {
                    draggedIdRef.current = team.id;
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
                  setDragOverId(team.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  if (draggedIdRef.current) {
                    handleReorder(draggedIdRef.current, team.id);
                  }
                }}
                isDragOver={dragOverId === team.id}
                extra={
                  <label className="flex items-center gap-1 text-xs cursor-pointer" title={t('scheduling.config.maxPerShiftTooltip')}>
                    <input
                      type="checkbox"
                      checked={team.max_doctors_per_shift === 1}
                      onChange={(e) => handleToggleMaxPerShift(team.id, e.target.checked)}
                      className="rounded border-input"
                    />
                    {t('scheduling.config.maxPerShiftLabel')}
                  </label>
                }
                prefix={
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                }
              />
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
  );
}
