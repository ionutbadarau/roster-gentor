'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  FileDown,
  Mail,
  MousePointerClick,
  RotateCw,
  Scale,
  ShieldCheck,
  Undo2,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import ro from '@/lib/i18n/ro.json';
import en from '@/lib/i18n/en.json';

const ICONS: Record<string, LucideIcon> = {
  'auto-generate': Zap,
  'rest-conflicts': ShieldCheck,
  equalize: Scale,
  'leave-bridge': CalendarDays,
  export: FileDown,
  email: Mail,
  'rotating-teams': RotateCw,
  'floating-doctors': UserPlus,
  'click-drag': MousePointerClick,
  'undo-redo': Undo2,
};

export default function FeaturesContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const { t, language } = useTranslation();

  const items =
    language === 'en'
      ? en.marketing.featuresPage.items
      : ro.marketing.featuresPage.items;

  const ctaHref = isLoggedIn ? '/grid' : '/sign-up';
  const ctaLabel = isLoggedIn
    ? t('marketing.cta.openDashboard')
    : t('marketing.featuresPage.ctaPrimary');

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F6E56]/5 via-white to-[#1D9E75]/10 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight mb-5">
              {t('marketing.featuresPage.h1')}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-8">
              {t('marketing.featuresPage.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center px-6 py-3 text-white bg-[#0F6E56] rounded-lg hover:bg-[#0A3D31] transition-colors text-base font-medium shadow-lg shadow-[#0F6E56]/30"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-6 py-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-base font-medium"
              >
                {t('marketing.featuresPage.ctaSecondary')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-16 sm:space-y-20">
            {items.map((item) => {
              const Icon = ICONS[item.id] ?? Zap;
              return (
                <article key={item.id} id={item.id} className="scroll-mt-24">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0F6E56]/10 dark:bg-[#0F6E56]/30 text-[#0F6E56] dark:text-[#1D9E75] flex-shrink-0">
                      <Icon className="w-6 h-6" />
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      {item.title}
                    </h2>
                  </div>
                  <p className="text-base sm:text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
            {t('marketing.featuresPage.ctaSectionTitle')}
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            {t('marketing.featuresPage.ctaSectionSubtitle')}
          </p>
          <Link
            href={ctaHref}
            className="inline-flex items-center px-8 py-4 text-white bg-[#0F6E56] rounded-lg hover:bg-[#0A3D31] transition-colors text-lg font-medium shadow-lg shadow-[#0F6E56]/30"
          >
            {ctaLabel}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
