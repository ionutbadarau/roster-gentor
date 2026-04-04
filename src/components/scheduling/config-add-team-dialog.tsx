'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Team } from '@/types/scheduling';

const TEAM_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

interface ConfigAddTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  onAddTeam: (name: string, color: string, teams: Team[]) => Promise<boolean>;
}

export default function ConfigAddTeamDialog({ open, onOpenChange, teams, onAddTeam }: ConfigAddTeamDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [adding, setAdding] = useState(false);
  const { t } = useTranslation();

  const handleAdd = async () => {
    setAdding(true);
    const success = await onAddTeam(name, color, teams);
    setAdding(false);
    if (success) {
      setName('');
      setColor('#3b82f6');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('scheduling.config.teamsTitle')}</DialogTitle>
          <DialogDescription>{t('scheduling.config.teamsDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dialog-team-name">{t('scheduling.config.teamName')}</Label>
            <Input
              id="dialog-team-name"
              placeholder={t('scheduling.config.teamNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleAdd(); }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t('scheduling.config.teamColor')}</Label>
            <div className="flex gap-2">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c ? 'border-primary scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding || !name.trim()}>
            {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('scheduling.config.addTeam')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
