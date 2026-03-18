import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Doctor, Shift } from '@/types/scheduling';
import { useTranslation } from '@/lib/i18n';

interface DoctorStats {
  dayShifts: number;
  nightShifts: number;
  totalHours: number;
  baseNorm: number;
}

interface ShiftGridDoctorRowProps {
  doctor: Doctor;
  teamColor: string;
  stats: DoctorStats;
  days: number[];
  dayShiftLetter: string;
  nightShiftLetter: string;
  leaveLetter: string;
  getShiftForDay: (day: number) => Shift | undefined;
  isLeaveDay: (day: number) => boolean;
  isCellSelected: (day: number) => boolean;
  hasRestViolation: (day: number) => boolean;
  isBridgeDay: (day: number) => boolean;
  isNonWorkingDay: (day: number) => boolean;
  isUnderstaffedDay: (day: number) => boolean;
  isNationalHoliday: (day: number) => boolean;
  isWeekend: (day: number) => boolean;
  onCellMouseDown: (day: number, e: React.MouseEvent) => void;
  onCellMouseEnter: (day: number) => void;
  hasGenerated: boolean;
}

function getCellClassName(
  selected: boolean,
  violation: boolean,
  bridge: boolean,
  isLeave: boolean,
  shift: Shift | undefined,
  nonWorking: boolean,
  isManual: boolean,
): string {
  const base = 'w-full h-full min-h-[32px] flex items-center justify-center text-xs font-bold transition-colors select-none';
  let state: string;

  if (selected) {
    state = 'ring-2 ring-primary ring-inset bg-primary/20';
  } else if (violation) {
    state = 'bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 ring-2 ring-red-500 ring-inset';
  } else if (bridge) {
    state = 'bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400';
  } else if (isLeave) {
    state = nonWorking
      ? 'bg-orange-50 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800/70'
      : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800';
  } else if (shift?.shift_type === '24h') {
    state = nonWorking
      ? 'bg-purple-50 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-800/70'
      : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800';
  } else if (shift?.shift_type === 'day') {
    state = nonWorking
      ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/70'
      : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800';
  } else if (shift?.shift_type === 'night') {
    state = nonWorking
      ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/70'
      : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800';
  } else {
    state = nonWorking ? 'bg-muted/60 hover:bg-muted/80' : 'hover:bg-accent';
  }

  const manual = isManual ? 'ring-2 ring-yellow-400 ring-inset' : '';
  return `${base} ${state} ${manual}`;
}

function ShiftGridDoctorRow({
  doctor,
  teamColor,
  stats,
  days,
  dayShiftLetter,
  nightShiftLetter,
  leaveLetter,
  getShiftForDay,
  isLeaveDay,
  isCellSelected,
  hasRestViolation,
  isBridgeDay,
  isNonWorkingDay,
  isUnderstaffedDay,
  isNationalHoliday,
  isWeekend,
  onCellMouseDown,
  onCellMouseEnter,
  hasGenerated,
}: ShiftGridDoctorRowProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex border-b ${
      hasGenerated && stats.totalHours < stats.baseNorm
        ? 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40'
        : 'hover:bg-accent/30'
    }`}>
      <div className="w-48 min-w-48 p-2 border-r flex items-center gap-2 sticky left-0 bg-background z-10">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: teamColor }}
        />
        <span className="truncate text-sm font-medium">{doctor.name}</span>
        {doctor.is_floating && (
          <Badge variant="outline" className="text-xs ml-auto">F</Badge>
        )}
      </div>
      {days.map(day => {
        const shift = getShiftForDay(day);
        const leave = isLeaveDay(day);
        const selected = isCellSelected(day);
        const violation = hasRestViolation(day);
        const bridge = isBridgeDay(day);
        const nonWorking = isNonWorkingDay(day);

        return (
          <div
            key={day}
            className={`w-10 min-w-10 border-r flex items-center justify-center relative ${
              isUnderstaffedDay(day) ? 'bg-red-50 dark:bg-red-950/30' : isNationalHoliday(day) ? 'bg-rose-50 dark:bg-rose-950/30' : isWeekend(day) ? 'bg-muted/50' : ''
            }`}
          >
            <button
              className={getCellClassName(selected, violation, bridge, leave, shift, nonWorking, !!shift?.is_manual)}
              title={shift?.is_manual ? t('scheduling.grid.manualShiftTooltip') : violation ? t('scheduling.grid.insufficientRestTooltip') : bridge ? t('scheduling.grid.bridgeDayTooltip') : t('scheduling.grid.multiSelectTooltip')}
              onMouseDown={(e) => onCellMouseDown(day, e)}
              onMouseEnter={() => onCellMouseEnter(day)}
            >
              {bridge ? '·' : leave ? leaveLetter : shift?.shift_type === '24h' ? 'DN' : shift?.shift_type === 'day' ? dayShiftLetter : shift?.shift_type === 'night' ? nightShiftLetter : ''}
            </button>
          </div>
        );
      })}
      <div className="w-20 min-w-20 p-2 border-r text-center text-xs font-semibold">
        {(() => {
          const delta = stats.totalHours - stats.baseNorm;
          if (!hasGenerated) return `${delta}h`;
          const color = delta >= 0 ? 'text-green-600' : 'text-red-600';
          return <span className={color}>{delta > 0 ? '+' : ''}{delta}h</span>;
        })()}
      </div>
    </div>
  );
}

export default memo(ShiftGridDoctorRow);
export type { DoctorStats };
