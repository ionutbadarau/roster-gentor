'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import en from './en.json';
import ro from './ro.json';

export type Language = 'en' | 'ro';

const STORAGE_KEY = 'app-language';
const DEFAULT_LANG: Language = 'ro';

const translations: Record<Language, typeof ro> = { en: en as typeof ro, ro };

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tArray: (key: string) => string[];
  tMessage: (message: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(obj: Record<string, unknown>, key: string): unknown {
  const keys = key.split('.');
  let current: unknown = obj;
  for (const k of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[k];
  }
  return current;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with DEFAULT_LANG so server and client initial render match
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANG);

  useEffect(() => {
    // After hydration, read the user's stored preference
    const fromStorage = localStorage.getItem(STORAGE_KEY) as Language | null;
    const resolved = (fromStorage === 'en' || fromStorage === 'ro') ? fromStorage : DEFAULT_LANG;
    if (resolved !== DEFAULT_LANG) {
      setLanguageState(resolved);
    }
    document.cookie = `app-language=${resolved}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = resolved;
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    document.cookie = `app-language=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = lang;
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = resolve(translations[language] as unknown as Record<string, unknown>, key);
    let result = typeof value === 'string' ? value : key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      });
    }
    return result;
  }, [language]);

  const tArray = useCallback((key: string): string[] => {
    const value = resolve(translations[language] as unknown as Record<string, unknown>, key);
    return Array.isArray(value) ? value as string[] : [];
  }, [language]);

  const tMessage = useCallback((message: string): string => {
    const sepIndex = message.indexOf('::');
    if (sepIndex === -1) return message;
    const key = message.slice(0, sepIndex);
    try {
      const params = JSON.parse(message.slice(sepIndex + 2));
      return t(key, params);
    } catch {
      return t(key);
    }
  }, [t]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, tArray, tMessage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
