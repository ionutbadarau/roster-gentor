import { Button } from '@/components/ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles, Trash2, Loader2, Phone, FileDown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ShiftGridHeaderProps {
  currentMonth: number;
  currentYear: number;
  currentLeaveDaysCount: number;
  totalBridgeDaysCount: number;
  generating: boolean;
  dispatchAssigning: boolean;
  hasGeneratedSchedule: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onGenerate: () => void;
  onClearMonth: () => void;
  onAssignDispatch: () => void;
  onExportPdf: () => void;
}

export default function ShiftGridHeader({
  currentMonth,
  currentYear,
  currentLeaveDaysCount,
  totalBridgeDaysCount,
  generating,
  dispatchAssigning,
  hasGeneratedSchedule,
  onPreviousMonth,
  onNextMonth,
  onGenerate,
  onClearMonth,
  onAssignDispatch,
  onExportPdf,
}: ShiftGridHeaderProps) {
  const { t, tArray } = useTranslation();
  const monthNames = tArray('months');

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
            <Button variant="outline" onClick={onClearMonth}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('scheduling.grid.clearMonth')}
            </Button>
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? t('scheduling.grid.generating') : t('scheduling.grid.generate')}
            </Button>
            <Button variant="outline" onClick={onAssignDispatch} disabled={dispatchAssigning || !hasGeneratedSchedule}>
              {dispatchAssigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
              {dispatchAssigning ? t('scheduling.grid.assigningDispatch') : t('scheduling.grid.assignDispatch')}
            </Button>
            <Button variant="outline" onClick={onExportPdf} disabled={!hasGeneratedSchedule}>
              <FileDown className="h-4 w-4 mr-2" />
              {t('scheduling.grid.exportPdf')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <div className="flex items-center justify-between mb-6">
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
    </>
  );
}
