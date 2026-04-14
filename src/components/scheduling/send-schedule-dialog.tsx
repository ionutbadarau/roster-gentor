'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Send } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { Doctor } from '@/types/scheduling';

interface SendScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctors: Doctor[];
  monthName: string;
  year: number;
  sending: boolean;
  onSend: () => void;
}

export default function SendScheduleDialog({
  open,
  onOpenChange,
  doctors,
  monthName,
  year,
  sending,
  onSend,
}: SendScheduleDialogProps) {
  const { t } = useTranslation();

  const withEmail = doctors.filter(d => d.email?.trim());
  const withoutEmail = doctors.length - withEmail.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('scheduling.grid.sendScheduleDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('scheduling.grid.sendScheduleDialogDescription', { month: monthName, year: String(year) })}
          </DialogDescription>
        </DialogHeader>

        {withEmail.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            {t('scheduling.grid.sendScheduleNoEmails')}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-48 overflow-y-auto space-y-1">
              {withEmail.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{d.name}</span>
                  <span className="text-muted-foreground truncate ml-auto">{d.email}</span>
                </div>
              ))}
            </div>
            {withoutEmail > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('scheduling.grid.sendScheduleSkipped', { count: String(withoutEmail) })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('scheduling.config.cancel')}
          </Button>
          <Button onClick={onSend} disabled={sending || withEmail.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {sending ? t('scheduling.grid.sendingSchedule') : t('scheduling.grid.sendSchedule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
