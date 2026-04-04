'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Doctor, Team } from '@/types/scheduling';

interface ConfigAddDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  doctors: Doctor[];
  defaultTeamId?: string;
  onAddDoctor: (name: string, teamId: string, doctors: Doctor[]) => Promise<boolean>;
}

export default function ConfigAddDoctorDialog({ open, onOpenChange, teams, doctors, defaultTeamId, onAddDoctor }: ConfigAddDoctorDialogProps) {
  const [name, setName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      setSelectedTeamId(defaultTeamId ?? teams[0]?.id ?? '');
      setName('');
    }
  }, [open, defaultTeamId, teams]);

  const handleAdd = async () => {
    setAdding(true);
    const success = await onAddDoctor(name, selectedTeamId, doctors);
    setAdding(false);
    if (success) {
      setName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('scheduling.config.doctorsTitle')}</DialogTitle>
          <DialogDescription>{t('scheduling.config.doctorsDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dialog-doctor-name">{t('scheduling.config.doctorName')}</Label>
            <Input
              id="dialog-doctor-name"
              placeholder={t('scheduling.config.doctorNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleAdd(); }}
              autoFocus
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
        </div>

        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding || !name.trim()}>
            {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('scheduling.config.addDoctor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
