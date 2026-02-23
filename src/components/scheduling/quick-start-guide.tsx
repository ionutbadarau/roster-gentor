'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface QuickStartGuideProps {
  hasTeams: boolean;
  hasDoctors: boolean;
  hasSchedule: boolean;
}

export default function QuickStartGuide({ hasTeams, hasDoctors, hasSchedule }: QuickStartGuideProps) {
  const { t } = useTranslation();

  const steps = [
    {
      title: t('scheduling.quickStart.createTeams'),
      description: t('scheduling.quickStart.createTeamsDesc'),
      completed: hasTeams,
    },
    {
      title: t('scheduling.quickStart.addDoctors'),
      description: t('scheduling.quickStart.addDoctorsDesc'),
      completed: hasDoctors,
    },
    {
      title: t('scheduling.quickStart.generateSchedule'),
      description: t('scheduling.quickStart.generateScheduleDesc'),
      completed: hasSchedule,
    },
  ];

  const allCompleted = steps.every((step) => step.completed);

  if (allCompleted) return null;

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader>
        <CardTitle>{t('scheduling.quickStart.title')}</CardTitle>
        <CardDescription>{t('scheduling.quickStart.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              {step.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`font-medium ${step.completed ? 'text-green-600' : ''}`}>
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
