'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Gift } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import ro from '@/lib/i18n/ro.json';
import en from '@/lib/i18n/en.json';

type Plan = 'monthly' | 'yearly';

export default function PricingContent({
  isLoggedIn = false,
  isSubscribed = false,
}: {
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
}) {
  const { t, language } = useTranslation();
  const [plan, setPlan] = useState<Plan>('yearly');

  const faqs =
    language === 'en'
      ? en.marketing.pricing.faqs
      : ro.marketing.pricing.faqs;

  const ctaHref = !isLoggedIn
    ? '/sign-up'
    : isSubscribed
      ? '/grid'
      : `/subscribe?plan=${plan}`;
  const ctaLabel = !isLoggedIn
    ? t('marketing.pricing.ctaSignUp')
    : isSubscribed
      ? t('marketing.cta.openDashboard')
      : t('marketing.cta.subscribeNow');

  const featureKeys = [
    'feature1',
    'feature2',
    'feature3',
    'feature4',
    'feature5',
    'feature6',
    'feature7',
    'feature8',
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F6E56]/5 via-white to-[#1D9E75]/10 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-sm font-medium mb-6">
              <Gift className="w-4 h-4" />
              {t('marketing.pricing.trialBadge')}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight mb-5">
              {t('marketing.pricing.h1')}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300">
              {t('marketing.pricing.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Pricing card */}
      <section className="py-16 sm:py-24 bg-white dark:bg-gray-950 flex items-center">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="rounded-2xl border-2 border-[#0F6E56] bg-white dark:bg-gray-900 shadow-2xl shadow-[#0F6E56]/10 p-8 space-y-6">
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800 w-full">
                <button
                  type="button"
                  onClick={() => setPlan('monthly')}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md transition ${
                    plan === 'monthly'
                      ? 'bg-white dark:bg-gray-700 shadow-sm font-medium text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t('marketing.pricing.monthlyLabel')}
                </button>
                <button
                  type="button"
                  onClick={() => setPlan('yearly')}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md transition flex items-center justify-center gap-2 ${
                    plan === 'yearly'
                      ? 'bg-white dark:bg-gray-700 shadow-sm font-medium text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t('marketing.pricing.yearlyLabel')}
                  <span className="text-green-600 dark:text-green-400 text-xs font-semibold">
                    {t('marketing.pricing.yearlyBadge')}
                  </span>
                </button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">PlanGarzi</p>
                <p className="text-5xl font-bold text-gray-900 dark:text-white">
                  {plan === 'monthly' ? '$7' : '$5'}
                  <span className="text-base font-normal text-gray-500 dark:text-gray-400">
                    {t('marketing.pricing.perMonth')}
                  </span>
                </p>
                {plan === 'yearly' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('marketing.pricing.yearlyBilledNote')}
                  </p>
                )}
              </div>

              <Link
                href={ctaHref}
                className="flex items-center justify-center w-full px-8 py-4 text-white bg-[#0F6E56] rounded-lg hover:bg-[#0A3D31] transition-colors text-base font-medium shadow-lg shadow-[#0F6E56]/30"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                {t('marketing.pricing.noCardRequired')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-12 text-center tracking-tight">
              {t('marketing.pricing.featuresTitle')}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
              {featureKeys.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {t(`marketing.pricing.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-24 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-10 text-center tracking-tight">
              {t('marketing.pricing.faqTitle')}
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base font-semibold text-gray-900 dark:text-white">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">
            {t('marketing.cta.v1')}
          </h2>
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
