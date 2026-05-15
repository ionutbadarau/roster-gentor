import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import PricingContent from './pricing-content';
import ro from '@/lib/i18n/ro.json';
import { createClient } from '../../../supabase/server';
import { getSubscriptionStatus } from '@/lib/subscription';

const SITE_URL = 'https://plangarzi.ro';

export const metadata: Metadata = {
  title: ro.marketing.pricing.metaTitle,
  description: ro.marketing.pricing.metaDescription,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: ro.marketing.pricing.metaTitle,
    description: ro.marketing.pricing.metaDescription,
    url: `${SITE_URL}/pricing`,
    type: 'website',
    locale: 'ro_RO',
    siteName: 'PlanGarzi',
  },
  twitter: {
    card: 'summary_large_image',
    title: ro.marketing.pricing.metaTitle,
    description: ro.marketing.pricing.metaDescription,
  },
};

const faqs = ro.marketing.pricing.faqs;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PlanGarzi',
  description: ro.marketing.pricing.metaDescription,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Healthcare Scheduling',
  operatingSystem: 'Web',
  url: `${SITE_URL}/pricing`,
  image: `${SITE_URL}/opengraph-image`,
  publisher: { '@type': 'Organization', name: 'PlanGarzi', url: SITE_URL },
  offers: [
    {
      '@type': 'Offer',
      name: 'Plan Lunar',
      price: '7.00',
      priceCurrency: 'EUR',
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
    },
    {
      '@type': 'Offer',
      name: 'Plan Anual',
      price: '60.00',
      priceCurrency: 'EUR',
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
    },
  ],
};

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  let isSubscribed = false;
  if (user) {
    const subscriptionStatus = await getSubscriptionStatus(user.id);
    isSubscribed = subscriptionStatus.access === 'active';
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <PricingContent isLoggedIn={isLoggedIn} isSubscribed={isSubscribed} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
