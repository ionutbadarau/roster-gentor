import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ShiftGridWarningsProps {
  warnings: string[];
  understaffedDays: Map<number, { available: number; required: number }>;
}

export default function ShiftGridWarnings({ warnings, understaffedDays }: ShiftGridWarningsProps) {
  const { t, tMessage } = useTranslation();

  return (
    <>
      {warnings.length > 0 && (
        <Alert className="mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <ul className="list-disc list-inside">
              {warnings.map((warning, idx) => (
                <li key={idx}>{tMessage(warning)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {understaffedDays.size > 0 && (
        <Alert className="mt-4 border-red-500 bg-red-50 dark:bg-red-950">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <div className="font-medium mb-1">{t('scheduling.grid.understaffedDaysTitle')}</div>
            <ul className="list-disc list-inside">
              {Array.from(understaffedDays.entries()).map(([day, { available, required }]) => (
                <li key={day}>{t('scheduling.grid.understaffedWarning', { day, available, required })}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
