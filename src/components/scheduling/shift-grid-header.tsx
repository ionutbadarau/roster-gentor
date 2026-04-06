import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, Trash2, Loader2, Phone, FileDown, Undo2, Redo2, MoreHorizontal, Scale } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ShiftGridHeaderProps {
  currentMonth: number;
  currentYear: number;
  currentLeaveDaysCount: number;
  totalBridgeDaysCount: number;
  generating: boolean;
  dispatchAssigning: boolean;
  equalizing: boolean;
  hasGeneratedSchedule: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onGenerate: () => void;
  onClearMonth: () => void;
  onAssignDispatch: () => void;
  onEqualizeShifts: () => void;
  onExportPdf: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
  canRedo?: boolean;
  onRedo?: () => void;
}

export default function ShiftGridHeader({
  currentMonth,
  currentYear,
  currentLeaveDaysCount,
  totalBridgeDaysCount,
  generating,
  dispatchAssigning,
  equalizing,
  hasGeneratedSchedule,
  onPreviousMonth,
  onNextMonth,
  onGenerate,
  onClearMonth,
  onAssignDispatch,
  onEqualizeShifts,
  onExportPdf,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
}: ShiftGridHeaderProps) {
  const { t, tArray } = useTranslation();
  const monthNames = tArray('months');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {t('scheduling.grid.title')}
            </CardTitle>
            <CardDescription>
              {t('scheduling.grid.description')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm flex items-center gap-3">
              <span>
                <span className="text-muted-foreground">{t('scheduling.grid.leaveDaysThisMonth') + ': '}</span>
                <Badge variant="outline">
                  {currentLeaveDaysCount}
                </Badge>
              </span>
              {totalBridgeDaysCount > 0 && (
                <span>
                  <span className="text-muted-foreground">{t('scheduling.grid.bridgeDaysThisMonth') + ': '}</span>
                  <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30">
                    {totalBridgeDaysCount}
                  </Badge>
                </span>
              )}
            </div>
            <div className="flex">
              <Button variant="outline" size="icon" className="rounded-r-none border-r-0" onClick={onUndo} disabled={!canUndo} title={t('scheduling.grid.undo') + ' (Ctrl+Z)'}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="rounded-l-none" onClick={onRedo} disabled={!canRedo} title={t('scheduling.grid.redo') + ' (Ctrl+Y)'}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? t('scheduling.grid.generating') : t('scheduling.grid.generate')}
            </Button>
            <Button variant="outline" onClick={onEqualizeShifts} disabled={equalizing || !hasGeneratedSchedule}>
              {equalizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scale className="h-4 w-4 mr-2" />}
              {equalizing ? t('scheduling.grid.equalizingShifts') : t('scheduling.grid.equalizeShifts')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title={t('scheduling.grid.moreActions')}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setClearDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('scheduling.grid.clearMonth')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAssignDispatch} disabled={dispatchAssigning || !hasGeneratedSchedule}>
                  <Phone className="h-4 w-4 mr-2" />
                  {dispatchAssigning ? t('scheduling.grid.assigningDispatch') : t('scheduling.grid.assignDispatch')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportPdf} disabled={!hasGeneratedSchedule}>
                  <FileDown className="h-4 w-4 mr-2" />
                  {t('scheduling.grid.exportPdf')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <div className="flex items-center justify-between mb-6 px-6">
        <Button variant="outline" size="sm" onClick={onPreviousMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-xl font-semibold">
          {monthNames[currentMonth]} {currentYear}
        </h3>
        <Button variant="outline" size="sm" onClick={onNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scheduling.grid.clearMonthConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('scheduling.grid.clearMonthConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('scheduling.grid.clearMonthCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onClearMonth(); setClearDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('scheduling.grid.clearMonthConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
