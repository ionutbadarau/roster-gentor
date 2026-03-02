'use client';

import { useState } from 'react';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from '@/lib/i18n';
import ConfigTeamsSection from './config-teams-section';
import ConfigDoctorsSection from './config-doctors-section';
import ConfigShiftSettings from './config-shift-settings';

interface ConfigurationPanelProps {
  doctors: Doctor[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  userId: string | null;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigurationPanel({ doctors, teams, shiftsPerDay, shiftsPerNight, userId, onUpdate }: ConfigurationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleCancelEdit = () => setEditingId(null);

  const handleConfirmEdit = async (id: string, type: 'doctor' | 'team') => {
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ConfigTeamsSection
          teams={teams}
          userId={userId}
          supabase={supabase}
          editingId={editingId}
          editingName={editingName}
          deletingId={deletingId}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onConfirmEdit={handleConfirmEdit}
          onSetDeletingId={setDeletingId}
          onEditingNameChange={setEditingName}
          onUpdate={onUpdate}
        />
        <ConfigDoctorsSection
          doctors={doctors}
          teams={teams}
          userId={userId}
          supabase={supabase}
          editingId={editingId}
          editingName={editingName}
          deletingId={deletingId}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onConfirmEdit={handleConfirmEdit}
          onSetDeletingId={setDeletingId}
          onEditingNameChange={setEditingName}
          onUpdate={onUpdate}
        />
      </div>
      <ConfigShiftSettings
        shiftsPerDay={shiftsPerDay}
        shiftsPerNight={shiftsPerNight}
        doctorCount={doctors.length}
        userId={userId}
        supabase={supabase}
        onUpdate={onUpdate}
      />
    </div>
  );
}
