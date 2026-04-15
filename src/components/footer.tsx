'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Footer({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <CalendarDays className="w-4 h-4" />
            <span>&copy; {currentYear} PlanGarzi. {t('marketing.footer.allRightsReserved')}</span>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <Link href="/grid" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('marketing.footer.dashboard')}
            </Link>
            <Link href="/contact" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('marketing.footer.contact')}
            </Link>
            {!isLoggedIn && (
              <Link href="/sign-in" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {t('marketing.footer.signIn')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
