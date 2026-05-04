'use client';

import { Analytics } from '@vercel/analytics/react';
import { useConsent } from '@/lib/consent';

export function AnalyticsGate() {
  const { consent, mounted } = useConsent();
  if (!mounted || !consent?.analytics) return null;
  return <Analytics />;
}
