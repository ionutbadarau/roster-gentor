'use client';

import { Phone, Mail } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export function ContactContent() {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('marketing.contact.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          {t('marketing.contact.description')}
        </p>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-0.5">
                {t('marketing.contact.phone')}
              </p>
              <a
                href="tel:0749284221"
                className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                0749 284 221
              </a>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-0.5">
                {t('marketing.contact.email')}
              </p>
              <a
                href="mailto:ioan.badarau88@gmail.com"
                className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                ioan.badarau88@gmail.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
