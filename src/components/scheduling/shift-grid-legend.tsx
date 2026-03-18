import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n';

interface ShiftGridLegendProps {
  dayShiftLetter: string;
  nightShiftLetter: string;
  leaveLetter: string;
  shift24hLetter: string;
}

export default function ShiftGridLegend({ dayShiftLetter, nightShiftLetter, leaveLetter, shift24hLetter }: ShiftGridLegendProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex items-center gap-6 text-sm flex-wrap">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-bold">{dayShiftLetter}</div>
        <span className="text-muted-foreground">{t('scheduling.grid.dayShiftLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 rounded flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold">{nightShiftLetter}</div>
        <span className="text-muted-foreground">{t('scheduling.grid.nightShiftLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900 rounded flex items-center justify-center text-purple-700 dark:text-purple-300 text-xs font-bold">{shift24hLetter}</div>
        <span className="text-muted-foreground">{t('scheduling.grid.shift24hLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-orange-100 dark:bg-orange-900 rounded flex items-center justify-center text-orange-700 dark:text-orange-300 text-xs font-bold">{leaveLetter}</div>
        <span className="text-muted-foreground">{t('scheduling.grid.leaveLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-rose-200 dark:bg-rose-900 rounded flex items-center justify-center text-rose-800 dark:text-rose-200 text-xs font-bold">H</div>
        <span className="text-muted-foreground">{t('scheduling.grid.holidayLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-amber-50 dark:bg-amber-900/30 rounded flex items-center justify-center text-amber-500 dark:text-amber-400 text-xs font-bold">·</div>
        <span className="text-muted-foreground">{t('scheduling.grid.bridgeDayLegend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">F</Badge>
        <span className="text-muted-foreground">{t('scheduling.grid.floatingBadge')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-red-200 dark:bg-red-900/60 rounded ring-2 ring-red-500 flex items-center justify-center text-red-800 dark:text-red-200 text-xs font-bold">!</div>
        <span className="text-muted-foreground">{t('scheduling.grid.insufficientRest')}</span>
      </div>
    </div>
  );
}
