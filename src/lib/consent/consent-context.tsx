'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CONSENT_KEY, CONSENT_VERSION, type ConsentState } from './types';

interface ConsentContextValue {
  consent: ConsentState | null;
  mounted: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (partial: { analytics: boolean }) => void;
  reset: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readStored(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed?.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
      analytics: parsed.analytics === true,
    };
  } catch {
    return null;
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setConsent(readStored());
    setMounted(true);
  }, []);

  const persist = useCallback((analytics: boolean) => {
    const next: ConsentState = {
      version: CONSENT_VERSION,
      timestamp: Date.now(),
      analytics,
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
    setConsent(next);
  }, []);

  const acceptAll = useCallback(() => persist(true), [persist]);
  const rejectAll = useCallback(() => persist(false), [persist]);
  const save = useCallback((partial: { analytics: boolean }) => persist(partial.analytics), [persist]);

  const reset = useCallback(() => {
    localStorage.removeItem(CONSENT_KEY);
    setConsent(null);
  }, []);

  return (
    <ConsentContext.Provider value={{ consent, mounted, acceptAll, rejectAll, save, reset }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider');
  return ctx;
}
