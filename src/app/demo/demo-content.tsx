'use client';

import Link from 'next/link';
import { ArrowRight, Eye } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import DemoShiftGrid from './demo-shift-grid';

export default function DemoContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const { t } = useTranslation();
  const ctaHref = isLoggedIn ? '/grid' : '/sign-up';
  const ctaLabel = isLoggedIn ? t('marketing.cta.openDashboard') : t('marketing.demo.ctaPrimary');

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F6E56]/5 via-white to-[#1D9E75]/10 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 py-16 sm:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-sm font-medium mb-6">
              <Eye className="w-4 h-4" />
              {t('marketing.demo.badge')}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight mb-5">
              {t('marketing.demo.h1')}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300">
              {t('marketing.demo.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Intro paragraph (keyword-rich, indexable) */}
      <section className="py-10 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <p className="text-base sm:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              {t('marketing.demo.intro')}
            </p>
          </div>
        </div>
      </section>

      {/* Grid block */}
      <section className="pb-16 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                {t('marketing.demo.monthLabel')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('marketing.demo.captionLine')}
              </p>
            </div>
            <DemoShiftGrid />
          </div>
        </div>
      </section>

      {/* Explainer */}
      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-8 tracking-tight">
              {t('marketing.demo.explainerTitle')}
            </h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>{t('marketing.demo.explainerColumns')}</p>
              <p>{t('marketing.demo.explainerColors')}</p>
              <p>{t('marketing.demo.explainerHolidays')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">
            {t('marketing.demo.ctaTitle')}
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href={ctaHref}
              className="inline-flex items-center px-8 py-4 text-white bg-[#0F6E56] rounded-lg hover:bg-[#0A3D31] transition-colors text-lg font-medium shadow-lg shadow-[#0F6E56]/30"
            >
              {ctaLabel}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center px-8 py-4 text-[#0F6E56] dark:text-[#1D9E75] border-2 border-[#0F6E56] dark:border-[#1D9E75] rounded-lg hover:bg-[#0F6E56]/5 transition-colors text-lg font-medium"
            >
              {t('marketing.demo.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
