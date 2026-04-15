'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Check, X, Trash2, Loader2, GripVertical, Mail } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Doctor, Team } from '@/types/scheduling';

interface ConfigDoctorCardProps {
  doctor: Doctor;
  teams: Team[];
  editingId: string | null;
  editingName: string;
  deletingId: string | null;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onConfirmEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onDelete: (id: string) => void;
  onChangeTeam: (doctorId: string, teamId: string) => void;
  onChangeShiftMode: (doctorId: string, mode: '12h' | '24h') => void;
  onToggleOptional: (doctorId: string, isOptional: boolean) => void;
  onToggleDispatch: (doctorId: string, canDispatch: boolean) => void;
  onChangeEmail: (doctorId: string, email: string) => void;
  dragHandleProps?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
}

export default function ConfigDoctorCard({
  doctor,
  teams,
  editingId,
  editingName,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onEditingNameChange,
  onDelete,
  onChangeTeam,
  onChangeShiftMode,
  onToggleOptional,
  onToggleDispatch,
  onChangeEmail,
  dragHandleProps,
  onDragOver,
  onDrop,
  isDragOver,
}: ConfigDoctorCardProps) {
  const { t } = useTranslation();
  const isEditing = editingId === doctor.id;
  const isDeleting = deletingId === doctor.id;
  const team = teams.find((tm) => tm.id === doctor.team_id);

  return (
    <div
      className={`flex flex-col gap-1.5 p-3 rounded-lg border bg-card transition-colors ${isDragOver ? 'border-primary bg-primary/5' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Line 1: Name + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                    {...dragHandleProps}
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
          {team && (
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
          )}
          {isEditing ? (
            <Input
              className="h-7 text-sm max-w-48"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              autoFocus
            />
          ) : (
            <p className="font-medium truncate">{doctor.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onConfirmEdit}>
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => onStartEdit(doctor.id, doctor.name)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(doctor.id)} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Line 2: Settings */}
      <div className="flex items-center gap-3 pl-9 flex-wrap">
        <Select
          value={doctor.team_id || '_floating'}
          onValueChange={(val) => onChangeTeam(doctor.id, val === '_floating' ? '' : val)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[7rem] text-xs gap-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_floating">
              <span className="text-xs">{t('scheduling.config.noTeamOption')}</span>
            </SelectItem>
            {teams.map((tm) => (
              <SelectItem key={tm.id} value={tm.id}>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tm.color }} />
                  {tm.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={doctor.shift_mode || '12h'}
          onValueChange={(val) => onChangeShiftMode(doctor.id, val as '12h' | '24h')}
        >
          <SelectTrigger className="h-7 w-[4.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h"><span className="text-xs">12h</span></SelectItem>
            <SelectItem value="24h"><span className="text-xs">24h</span></SelectItem>
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`optional-${doctor.id}`}
                  checked={doctor.is_optional ?? false}
                  onCheckedChange={(checked) => onToggleOptional(doctor.id, checked)}
                  className="scale-75"
                />
                <label htmlFor={`optional-${doctor.id}`} className="text-xs text-muted-foreground cursor-pointer">
                  {t('scheduling.config.optionalLabel')}
                </label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('scheduling.config.optionalTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`dispatch-${doctor.id}`}
                  checked={doctor.can_dispatch ?? false}
                  onCheckedChange={(checked) => onToggleDispatch(doctor.id, checked)}
                  className="scale-75"
                />
                <label htmlFor={`dispatch-${doctor.id}`} className="text-xs text-muted-foreground cursor-pointer">
                  {t('scheduling.config.dispatchLabel')}
                </label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('scheduling.config.dispatchTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="relative">
          <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="email"
            className="h-7 text-xs w-44 pl-7"
            placeholder={t('scheduling.config.emailPlaceholder')}
            defaultValue={doctor.email ?? ''}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (doctor.email ?? '')) onChangeEmail(doctor.id, val);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      </div>
    </div>
  );
}
