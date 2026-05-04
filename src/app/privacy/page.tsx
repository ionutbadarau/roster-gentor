import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import PrivacyContent from './privacy-content';
import ro from '@/lib/i18n/ro.json';

const SITE_URL = 'https://plangarzi.ro';

export const metadata: Metadata = {
  title: ro.marketing.privacy.metaTitle,
  description: ro.marketing.privacy.metaDescription,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: ro.marketing.privacy.metaTitle,
    description: ro.marketing.privacy.metaDescription,
    url: `${SITE_URL}/privacy`,
    type: 'website',
    locale: 'ro_RO',
    siteName: 'PlanGarzi',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <Navbar />
      <main className="flex-1">
        <PrivacyContent />
      </main>
      <Footer />
    </div>
  );
}
