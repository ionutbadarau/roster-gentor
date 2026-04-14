'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';
import { SupabaseClient } from '@supabase/supabase-js';
import { Doctor, Team } from '@/types/scheduling';

export function useConfigMutations(
  supabase: SupabaseClient,
  userId: string | null,
  onUpdate: () => void | Promise<void>,
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  // ── Teams ──────────────────────────────────────────────

  const addTeam = useCallback(async (name: string, color: string, teams: Team[]) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: t('common.error'), description: t('scheduling.config.teamNameRequired'), variant: 'destructive' });
      return false;
    }
    try {
      const maxOrder = teams.reduce((max, t) => Math.max(max, t.order ?? 0), 0);
      const { error } = await supabase.from('teams').insert({ name: trimmed, color, user_id: userId, order: maxOrder + 1 });
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.teamAddedSuccess') });
      await onUpdate();
      return true;
    } catch (error) {
      console.error('Error adding team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.teamAddError'), variant: 'destructive' });
      return false;
    }
  }, [supabase, userId, onUpdate, toast, t]);

  const deleteTeam = useCallback(async (teamId: string) => {
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.teamDeletedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.teamDeleteError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  const renameTeam = useCallback(async (teamId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const { error } = await supabase.from('teams').update({ name: trimmed }).eq('id', teamId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.teamRenamedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error renaming team:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.teamRenameError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  const reorderTeams = useCallback(async (fromId: string, toId: string, sortedTeams: Team[]) => {
    if (fromId === toId) return;
    const ordered = [...sortedTeams];
    const fromIndex = ordered.findIndex(t => t.id === fromId);
    const toIndex = ordered.findIndex(t => t.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    try {
      // First pass: shift all to temporary high values to avoid unique constraint violations
      const offset = 10000;
      for (let i = 0; i < ordered.length; i++) {
        await supabase.from('teams').update({ order: offset + i }).eq('id', ordered[i].id);
      }
      // Second pass: set final values
      for (let i = 0; i < ordered.length; i++) {
        await supabase.from('teams').update({ order: i + 1 }).eq('id', ordered[i].id);
      }
      await onUpdate();
    } catch (error) {
      console.error('Error reordering teams:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.reorderError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  const toggleMaxPerShift = useCallback(async (teamId: string, enabled: boolean) => {
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
  }, [supabase, onUpdate, toast, t]);

  // ── Doctors ────────────────────────────────────────────

  const addDoctor = useCallback(async (name: string, teamId: string, doctors: Doctor[], email?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: t('common.error'), description: t('scheduling.config.doctorNameRequired'), variant: 'destructive' });
      return false;
    }
    try {
      const maxOrder = doctors.reduce((max, d) => Math.max(max, d.display_order ?? 0), 0);
      const { error } = await supabase.from('doctors').insert({
        name: trimmed,
        email: email?.trim() || null,
        team_id: teamId || null,
        is_floating: !teamId,
        user_id: userId,
        display_order: maxOrder + 1,
      });
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.doctorAddedSuccess') });
      await onUpdate();
      return true;
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.doctorAddError'), variant: 'destructive' });
      return false;
    }
  }, [supabase, userId, onUpdate, toast, t]);

  const deleteDoctor = useCallback(async (doctorId: string) => {
    try {
      const { error } = await supabase.from('doctors').delete().eq('id', doctorId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.doctorDeletedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.doctorDeleteError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  const renameDoctor = useCallback(async (doctorId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const { error } = await supabase.from('doctors').update({ name: trimmed }).eq('id', doctorId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.doctorRenamedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error renaming doctor:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.doctorRenameError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  const reorderDoctors = useCallback(async (fromId: string, toId: string, sortedDoctors: Doctor[]) => {
    if (fromId === toId) return;
    const ordered = [...sortedDoctors];
    const fromIndex = ordered.findIndex(d => d.id === fromId);
    const toIndex = ordered.findIndex(d => d.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

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
  }, [supabase, onUpdate, toast, t]);

  const changeTeam = useCallback(async (doctorId: string, newTeamId: string) => {
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
  }, [supabase, onUpdate, toast, t]);

  const changeShiftMode = useCallback(async (doctorId: string, mode: '12h' | '24h') => {
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
  }, [supabase, onUpdate, toast, t]);

  const toggleOptional = useCallback(async (doctorId: string, isOptional: boolean) => {
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
  }, [supabase, onUpdate, toast, t]);

  const toggleDispatch = useCallback(async (doctorId: string, canDispatch: boolean) => {
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
  }, [supabase, onUpdate, toast, t]);

  const updateEmail = useCallback(async (doctorId: string, email: string) => {
    const trimmed = email.trim();
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ email: trimmed || null })
        .eq('id', doctorId);
      if (error) throw error;
      toast({ title: t('common.success'), description: t('scheduling.config.emailUpdatedSuccess') });
      await onUpdate();
    } catch (error) {
      console.error('Error updating email:', error);
      toast({ title: t('common.error'), description: t('scheduling.config.emailUpdateError'), variant: 'destructive' });
    }
  }, [supabase, onUpdate, toast, t]);

  // ── Shift Settings ─────────────────────────────────────

  const saveShiftSettings = useCallback(async (shiftsPerDay: number, shiftsPerNight: number, doctorCount: number) => {
    try {
      const { data: existing } = await supabase
        .from('schedule_config')
        .select('id, config_data')
        .limit(1)
        .maybeSingle();

      const newConfigData = {
        ...(existing?.config_data as Record<string, unknown> || {}),
        shiftsPerDay: Math.max(1, shiftsPerDay),
        shiftsPerNight: Math.max(1, shiftsPerNight),
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
    }
  }, [supabase, userId, onUpdate, toast, t]);

  return {
    addTeam, deleteTeam, renameTeam, reorderTeams, toggleMaxPerShift,
    addDoctor, deleteDoctor, renameDoctor, reorderDoctors,
    changeTeam, changeShiftMode, toggleOptional, toggleDispatch, updateEmail,
    saveShiftSettings,
  };
}
