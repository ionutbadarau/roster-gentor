'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, Plus, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { InfoTooltip } from './info-tooltip';
import { Doctor, Team } from '@/types/scheduling';
import ConfigDoctorCard from './config-doctor-card';

interface ConfigFloatingDoctorsProps {
  doctors: Doctor[];
  allTeams: Team[];
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onRenameDoctor: (doctorId: string, newName: string) => void;
  onDeleteDoctor: (doctorId: string) => void;
  onChangeTeam: (doctorId: string, teamId: string) => void;
  onChangeShiftMode: (doctorId: string, mode: '12h' | '24h') => void;
  onToggleOptional: (doctorId: string, isOptional: boolean) => void;
  onToggleDispatch: (doctorId: string, canDispatch: boolean) => void;
  onChangeEmail: (doctorId: string, email: string) => void;
  onReorderDoctors: (fromId: string, toId: string, sortedDoctors: Doctor[]) => void;
  onAddDoctor: () => void;
  setDeletingId: (id: string | null) => void;
}

export default function ConfigFloatingDoctors({
  doctors,
  allTeams,
  editingId,
  editingName,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onEditingNameChange,
  onRenameDoctor,
  onDeleteDoctor,
  onChangeTeam,
  onChangeShiftMode,
  onToggleOptional,
  onToggleDispatch,
  onChangeEmail,
  onReorderDoctors,
  onAddDoctor,
  setDeletingId,
}: ConfigFloatingDoctorsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [confirmDeleteDoctorId, setConfirmDeleteDoctorId] = useState<string | null>(null);

  const sortedDoctors = [...doctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const handleDeleteDoctor = async (doctorId: string) => {
    setConfirmDeleteDoctorId(null);
    setDeletingId(doctorId);
    await onDeleteDoctor(doctorId);
    setDeletingId(null);
  };

  const handleConfirmDoctorEdit = (doctorId: string) => {
    onRenameDoctor(doctorId, editingName);
    onCancelEdit();
  };

  if (sortedDoctors.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-dashed">
        {/* Header */}
        <div className="flex items-center justify-between p-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold truncate">{t('scheduling.config.floatingStaff')}</span>
            <InfoTooltip text={t('scheduling.config.floatingStaffTooltip')} />
            <Badge variant="secondary" className="text-xs shrink-0">
              {sortedDoctors.length}
            </Badge>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-muted-foreground">{t('scheduling.config.floatingStaffDesc')}</p>
            {sortedDoctors.map((doctor) => (
              <ConfigDoctorCard
                key={doctor.id}
                doctor={doctor}
                teams={allTeams}
                editingId={editingId}
                editingName={editingName}
                deletingId={deletingId}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onConfirmEdit={() => handleConfirmDoctorEdit(doctor.id)}
                onEditingNameChange={onEditingNameChange}
                onDelete={(id) => setConfirmDeleteDoctorId(id)}
                onChangeTeam={onChangeTeam}
                onChangeShiftMode={onChangeShiftMode}
                onToggleOptional={onToggleOptional}
                onToggleDispatch={onToggleDispatch}
                onChangeEmail={onChangeEmail}
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
                  if (!draggedIdRef.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverId(doctor.id);
                }}
                onDrop={(e) => {
                  if (!draggedIdRef.current) return;
                  e.preventDefault();
                  setDragOverId(null);
                  onReorderDoctors(draggedIdRef.current, doctor.id, sortedDoctors);
                }}
                isDragOver={dragOverId === doctor.id}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onAddDoctor}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('scheduling.config.addDoctor')}
            </Button>
          </div>
        </CollapsibleContent>
      </div>

      <AlertDialog open={!!confirmDeleteDoctorId} onOpenChange={(open) => { if (!open) setConfirmDeleteDoctorId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduling.config.deleteDoctorTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scheduling.config.deleteDoctorMessage', { name: doctors.find((d) => d.id === confirmDeleteDoctorId)?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('scheduling.config.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDeleteDoctorId && handleDeleteDoctor(confirmDeleteDoctorId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('scheduling.config.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
