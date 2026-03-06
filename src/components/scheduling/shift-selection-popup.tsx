import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface SelectionPopupData {
  doctorId: string;
  days: number[];
  x: number;
  y: number;
}

interface ShiftSelectionPopupProps {
  popup: SelectionPopupData;
  hasAssignments: boolean;
  hasBridgeCandidates: boolean;
  onBatchAction: (action: 'day' | 'night' | 'leave' | 'bridge') => void;
  onBatchClear: () => void;
}

const ShiftSelectionPopup = forwardRef<HTMLDivElement, ShiftSelectionPopupProps>(
  ({ popup, hasAssignments, hasBridgeCandidates, onBatchAction, onBatchClear }, ref) => {
    const { t } = useTranslation();

    const POPUP_W = 190;
    let baseH = 160;
    if (hasBridgeCandidates) baseH += 36;
    if (hasAssignments) baseH += 40;
    const POPUP_H = baseH;
    const finalLeft = popup.x + POPUP_W > window.innerWidth ? popup.x - POPUP_W : popup.x;
    const finalTop = popup.y + 8 + POPUP_H > window.innerHeight ? popup.y - POPUP_H : popup.y + 8;

    return (
      <div
        ref={ref}
        className="fixed z-50 bg-popover border rounded-md shadow-md p-1 min-w-[180px]"
        style={{ left: finalLeft, top: finalTop }}
      >
        <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1">
          {popup.days.length} {popup.days.length === 1 ? t('scheduling.grid.selectedSingular') : t('scheduling.grid.selectedPlural')}
        </div>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
          onClick={() => onBatchAction('day')}
        >
          <span className="w-4 h-4 rounded bg-blue-500 flex-shrink-0" />
          {t('scheduling.grid.dayShiftLabel')}
        </button>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
          onClick={() => onBatchAction('night')}
        >
          <span className="w-4 h-4 rounded bg-indigo-500 flex-shrink-0" />
          {t('scheduling.grid.nightShiftLabel')}
        </button>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
          onClick={() => onBatchAction('leave')}
        >
          <span className="w-4 h-4 rounded bg-orange-500 flex-shrink-0" />
          {t('scheduling.grid.leaveLabel')}
        </button>
        {hasBridgeCandidates && (
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
            onClick={() => onBatchAction('bridge')}
          >
            <span className="w-4 h-4 rounded bg-amber-500 flex-shrink-0" />
            {t('scheduling.grid.bridgeDayLabel')}
          </button>
        )}
        {hasAssignments && (
          <>
            <div className="border-t my-1" />
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 text-destructive cursor-pointer"
              onClick={onBatchClear}
            >
              <X className="w-4 h-4 flex-shrink-0" />
              {t('scheduling.grid.clearSelection')}
            </button>
          </>
        )}
      </div>
    );
  },
);

ShiftSelectionPopup.displayName = 'ShiftSelectionPopup';

export default ShiftSelectionPopup;
export type { SelectionPopupData };
