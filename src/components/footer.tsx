'use client';

import Link from 'next/link';
import { Twitter, Linkedin, Github } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Product Column */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('marketing.footer.product')}</h3>
            <ul className="space-y-2">
              <li><Link href="#features" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.features')}</Link></li>
              <li><Link href="#pricing" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.pricing')}</Link></li>
              <li><Link href="/dashboard" className="text-gray-600 hover:text-blue-600">Dashboard</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.api')}</Link></li>
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('marketing.footer.company')}</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.about')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.blog')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.careers')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.press')}</Link></li>
            </ul>
          </div>

          {/* Resources Column */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('marketing.footer.resources')}</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.documentation')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.helpCenter')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.community')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.status')}</Link></li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">{t('marketing.footer.legal')}</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.privacy')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.terms')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.security')}</Link></li>
              <li><Link href="#" className="text-gray-600 hover:text-blue-600">{t('marketing.footer.cookies')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-200">
          <div className="text-gray-600 mb-4 md:mb-0">
            © {currentYear} Your Company. {t('marketing.footer.allRightsReserved')}
          </div>

          <div className="flex space-x-6">
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Twitter</span>
              <Twitter className="h-6 w-6" />
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">LinkedIn</span>
              <Linkedin className="h-6 w-6" />
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">GitHub</span>
              <Github className="h-6 w-6" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
