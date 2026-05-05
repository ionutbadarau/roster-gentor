import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import FeaturesContent from './features-content';
import ro from '@/lib/i18n/ro.json';
import { createClient } from '../../../supabase/server';

const SITE_URL = 'https://plangarzi.ro';

export const metadata: Metadata = {
  title: ro.marketing.featuresPage.metaTitle,
  description: ro.marketing.featuresPage.metaDescription,
  alternates: { canonical: '/features' },
  openGraph: {
    title: ro.marketing.featuresPage.metaTitle,
    description: ro.marketing.featuresPage.metaDescription,
    url: `${SITE_URL}/features`,
    type: 'website',
    locale: 'ro_RO',
    siteName: 'PlanGarzi',
  },
  twitter: {
    card: 'summary_large_image',
    title: ro.marketing.featuresPage.metaTitle,
    description: ro.marketing.featuresPage.metaDescription,
  },
};

const items = ro.marketing.featuresPage.items;

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: ro.marketing.featuresPage.h1,
  itemListElement: items.map((item, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: item.title,
    description: item.body,
    url: `${SITE_URL}/features#${item.id}`,
  })),
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PlanGarzi',
  description: ro.marketing.featuresPage.metaDescription,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '7.00',
    priceCurrency: 'USD',
    url: `${SITE_URL}/pricing`,
  },
  featureList: items.map((i) => i.title).join(', '),
};

export default async function FeaturesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <FeaturesContent isLoggedIn={isLoggedIn} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
