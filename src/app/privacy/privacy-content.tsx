'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useConsent } from '@/lib/consent';

const cookieEntryKeys = ['supabase', 'language', 'consent', 'vercel'] as const;

export default function PrivacyContent() {
  const { t } = useTranslation();
  const { reset } = useConsent();

  const sec = (key: string) => `marketing.privacy.sections.${key}`;

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12 text-gray-800 dark:text-gray-200">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t('marketing.privacy.title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('marketing.privacy.lastUpdated')}</p>
        <p className="mt-6 text-base leading-relaxed">{t('marketing.privacy.intro')}</p>
      </header>

      <section id="controller" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('controller')}.title`)}</h2>
        <p className="leading-relaxed">{t(`${sec('controller')}.body`)}</p>
      </section>

      <section id="data" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('data')}.title`)}</h2>
        <p className="leading-relaxed mb-3">{t(`${sec('data')}.intro`)}</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>{t(`${sec('data')}.items.account.label`)}:</strong> {t(`${sec('data')}.items.account.body`)}</li>
          <li><strong>{t(`${sec('data')}.items.doctors.label`)}:</strong> {t(`${sec('data')}.items.doctors.body`)}</li>
          <li><strong>{t(`${sec('data')}.items.schedules.label`)}:</strong> {t(`${sec('data')}.items.schedules.body`)}</li>
          <li><strong>{t(`${sec('data')}.items.billing.label`)}:</strong> {t(`${sec('data')}.items.billing.body`)}</li>
          <li><strong>{t(`${sec('data')}.items.contact.label`)}:</strong> {t(`${sec('data')}.items.contact.body`)}</li>
        </ul>
      </section>

      <section id="purposes" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('purposes')}.title`)}</h2>
        <p className="leading-relaxed">{t(`${sec('purposes')}.body`)}</p>
      </section>

      <section id="legal-basis" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('legalBasis')}.title`)}</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>{t(`${sec('legalBasis')}.contract`)}</li>
          <li>{t(`${sec('legalBasis')}.legitimate`)}</li>
          <li>{t(`${sec('legalBasis')}.consent`)}</li>
        </ul>
      </section>

      <section id="processors" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('processors')}.title`)}</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>{t(`${sec('processors')}.supabase`)}</li>
          <li>{t(`${sec('processors')}.stripe`)}</li>
          <li>{t(`${sec('processors')}.resend`)}</li>
          <li>{t(`${sec('processors')}.vercel`)}</li>
        </ul>
      </section>

      <section id="retention" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('retention')}.title`)}</h2>
        <p className="leading-relaxed">{t(`${sec('retention')}.body`)}</p>
      </section>

      <section id="rights" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('rights')}.title`)}</h2>
        <p className="leading-relaxed mb-3">{t(`${sec('rights')}.intro`)}</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>{t(`${sec('rights')}.access`)}</li>
          <li>{t(`${sec('rights')}.rectify`)}</li>
          <li>{t(`${sec('rights')}.erase`)}</li>
          <li>{t(`${sec('rights')}.portability`)}</li>
          <li>{t(`${sec('rights')}.object`)}</li>
          <li>{t(`${sec('rights')}.withdraw`)}</li>
          <li>{t(`${sec('rights')}.complaint`)}</li>
        </ul>
      </section>

      <section id="exercise" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('exercise')}.title`)}</h2>
        <p className="leading-relaxed">
          {t(`${sec('exercise')}.body`)}{' '}
          <Link href="/account" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
            /account
          </Link>{' '}
          ·{' '}
          <Link href="/contact" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
            /contact
          </Link>
        </p>
      </section>

      <section id="cookies" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('cookies')}.title`)}</h2>
        <p className="leading-relaxed mb-4">{t(`${sec('cookies')}.intro`)}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 dark:border-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-3 border-b border-gray-200 dark:border-gray-800">{t(`${sec('cookies')}.headers.name`)}</th>
                <th className="text-left p-3 border-b border-gray-200 dark:border-gray-800">{t(`${sec('cookies')}.headers.purpose`)}</th>
                <th className="text-left p-3 border-b border-gray-200 dark:border-gray-800">{t(`${sec('cookies')}.headers.type`)}</th>
                <th className="text-left p-3 border-b border-gray-200 dark:border-gray-800">{t(`${sec('cookies')}.headers.duration`)}</th>
              </tr>
            </thead>
            <tbody>
              {cookieEntryKeys.map((entry) => (
                <tr key={entry} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-3 font-mono text-xs">{t(`${sec('cookies')}.entries.${entry}.name`)}</td>
                  <td className="p-3">{t(`${sec('cookies')}.entries.${entry}.purpose`)}</td>
                  <td className="p-3">{t(`${sec('cookies')}.entries.${entry}.type`)}</td>
                  <td className="p-3">{t(`${sec('cookies')}.entries.${entry}.duration`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Button variant="outline" onClick={reset}>
            {t('marketing.privacy.actions.manageCookies')}
          </Button>
        </div>
      </section>

      <section id="contact" className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">{t(`${sec('contact')}.title`)}</h2>
        <p className="leading-relaxed">
          {t(`${sec('contact')}.body`)}{' '}
          <a
            href={`mailto:${t(`${sec('contact')}.email`)}`}
            className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
          >
            {t(`${sec('contact')}.email`)}
          </a>
          .
        </p>
      </section>
    </article>
  );
}
