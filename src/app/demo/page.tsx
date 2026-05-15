import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import DemoContent from './demo-content';
import ro from '@/lib/i18n/ro.json';
import { createClient } from '../../../supabase/server';

const SITE_URL = 'https://plangarzi.ro';

export const metadata: Metadata = {
  title: ro.marketing.demo.metaTitle,
  description: ro.marketing.demo.metaDescription,
  alternates: { canonical: '/demo' },
  openGraph: {
    title: ro.marketing.demo.metaTitle,
    description: ro.marketing.demo.metaDescription,
    url: `${SITE_URL}/demo`,
    type: 'website',
    locale: 'ro_RO',
    siteName: 'PlanGarzi',
  },
  twitter: {
    card: 'summary_large_image',
    title: ro.marketing.demo.metaTitle,
    description: ro.marketing.demo.metaDescription,
  },
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PlanGarzi',
  description: ro.marketing.demo.metaDescription,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE_URL}/demo`,
  offers: {
    '@type': 'Offer',
    price: '7.00',
    priceCurrency: 'EUR',
    url: `${SITE_URL}/pricing`,
    availability: 'https://schema.org/InStock',
  },
};

export default async function DemoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <DemoContent isLoggedIn={isLoggedIn} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
