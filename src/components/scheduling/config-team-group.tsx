'use client';

import { useState, useRef } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Check, X, Trash2, Loader2, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Doctor, Team } from '@/types/scheduling';
import ConfigDoctorCard from './config-doctor-card';

interface ConfigTeamGroupProps {
  team: Team;
  doctors: Doctor[];
  allTeams: Team[];
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onRenameTeam: (teamId: string, newName: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onToggleMaxPerShift: (teamId: string, enabled: boolean) => void;
  onRenameDoctor: (doctorId: string, newName: string) => void;
  onDeleteDoctor: (doctorId: string) => void;
  onChangeTeam: (doctorId: string, teamId: string) => void;
  onChangeShiftMode: (doctorId: string, mode: '12h' | '24h') => void;
  onToggleOptional: (doctorId: string, isOptional: boolean) => void;
  onToggleDispatch: (doctorId: string, canDispatch: boolean) => void;
  onChangeEmail: (doctorId: string, email: string) => void;
  onReorderDoctors: (fromId: string, toId: string, sortedDoctors: Doctor[]) => void;
  onAddDoctorToTeam: (teamId: string) => void;
  // Team-level drag
  teamDragHandleProps?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  onTeamDragOver?: (e: React.DragEvent) => void;
  onTeamDrop?: (e: React.DragEvent) => void;
  isTeamDragOver?: boolean;
  setDeletingId: (id: string | null) => void;
}

export default function ConfigTeamGroup({
  team,
  doctors,
  allTeams,
  editingId,
  editingName,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onEditingNameChange,
  onRenameTeam,
  onDeleteTeam,
  onToggleMaxPerShift,
  onRenameDoctor,
  onDeleteDoctor,
  onChangeTeam,
  onChangeShiftMode,
  onToggleOptional,
  onToggleDispatch,
  onChangeEmail,
  onReorderDoctors,
  onAddDoctorToTeam,
  teamDragHandleProps,
  onTeamDragOver,
  onTeamDrop,
  isTeamDragOver,
  setDeletingId,
}: ConfigTeamGroupProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [doctorDragOverId, setDoctorDragOverId] = useState<string | null>(null);
  const doctorDraggedIdRef = useRef<string | null>(null);
  const [confirmDeleteTeamOpen, setConfirmDeleteTeamOpen] = useState(false);
  const [confirmDeleteDoctorId, setConfirmDeleteDoctorId] = useState<string | null>(null);

  const sortedDoctors = [...doctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const isEditingTeam = editingId === team.id;
  const isDeletingTeam = deletingId === team.id;

  const handleConfirmTeamEdit = () => {
    onRenameTeam(team.id, editingName);
    onCancelEdit();
  };

  const handleDeleteTeam = async () => {
    setConfirmDeleteTeamOpen(false);
    setDeletingId(team.id);
    await onDeleteTeam(team.id);
    setDeletingId(null);
  };

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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={`rounded-lg border transition-colors ${isTeamDragOver ? 'border-primary bg-primary/5' : ''}`}
        onDragOver={onTeamDragOver}
        onDrop={onTeamDrop}
      >
        {/* Team Header */}
        <div className="flex items-center justify-between p-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {teamDragHandleProps && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                      {...teamDragHandleProps}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('scheduling.config.dragToReorderTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />

            {isEditingTeam ? (
              <Input
                className="h-7 text-sm max-w-48"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmTeamEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                autoFocus
              />
            ) : (
              <span className="font-semibold truncate">{team.name}</span>
            )}

            <Badge variant="secondary" className="text-xs shrink-0">
              {sortedDoctors.length}
            </Badge>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id={`max-per-shift-${team.id}`}
                      checked={team.max_doctors_per_shift === 1}
                      onCheckedChange={(checked) => onToggleMaxPerShift(team.id, checked)}
                      className="scale-75"
                    />
                    <label htmlFor={`max-per-shift-${team.id}`} className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                      {t('scheduling.config.maxPerShiftLabel')}
                    </label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('scheduling.config.maxPerShiftTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isEditingTeam ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleConfirmTeamEdit}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => onStartEdit(team.id, team.name)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteTeamOpen(true)} disabled={isDeletingTeam}>
                  {isDeletingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                </Button>
              </>
            )}

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Doctor List */}
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {sortedDoctors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">
                {t('scheduling.config.noDoctors')}
              </p>
            )}
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
                    doctorDraggedIdRef.current = doctor.id;
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragEnd: () => {
                    doctorDraggedIdRef.current = null;
                    setDoctorDragOverId(null);
                  },
                }}
                onDragOver={(e) => {
                  if (!doctorDraggedIdRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDoctorDragOverId(doctor.id);
                }}
                onDrop={(e) => {
                  if (!doctorDraggedIdRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDoctorDragOverId(null);
                  onReorderDoctors(doctorDraggedIdRef.current, doctor.id, sortedDoctors);
                }}
                isDragOver={doctorDragOverId === doctor.id}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => onAddDoctorToTeam(team.id)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('scheduling.config.addDoctor')}
            </Button>
          </div>
        </CollapsibleContent>
      </div>

      <AlertDialog open={confirmDeleteTeamOpen} onOpenChange={setConfirmDeleteTeamOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduling.config.deleteTeamTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scheduling.config.deleteTeamMessage', { name: team.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('scheduling.config.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTeam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('scheduling.config.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
