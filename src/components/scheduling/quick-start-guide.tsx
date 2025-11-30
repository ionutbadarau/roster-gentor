'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle } from 'lucide-react';

interface QuickStartGuideProps {
  hasTeams: boolean;
  hasDoctors: boolean;
  hasSchedule: boolean;
}

export default function QuickStartGuide({ hasTeams, hasDoctors, hasSchedule }: QuickStartGuideProps) {
  const steps = [
    {
      title: 'Create Teams',
      description: 'Set up shift teams in the Configuration tab',
      completed: hasTeams,
    },
    {
      title: 'Add Doctors',
      description: 'Add doctors and assign them to teams',
      completed: hasDoctors,
    },
    {
      title: 'Generate Schedule',
      description: 'Create monthly schedules in the Calendar tab',
      completed: hasSchedule,
    },
  ];

  const allCompleted = steps.every((step) => step.completed);

  if (allCompleted) return null;

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader>
        <CardTitle>Quick Start Guide</CardTitle>
        <CardDescription>Follow these steps to get started with shift planning</CardDescription>
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
