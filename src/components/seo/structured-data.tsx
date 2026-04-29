const SITE_URL = 'https://plangarzi.ro';

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PlanGarzi',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'contact@plangarzi.ro',
    availableLanguage: ['Romanian', 'English'],
  },
};

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PlanGarzi',
  description:
    'Aplicație web pentru planificarea automată a gărzilor și turelor medicale în spitale. Generează programul lunar respectând perioadele de odihnă, distribuie echitabil turele și exportă în PDF sau Excel.',
  url: SITE_URL,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Healthcare Scheduling',
  operatingSystem: 'Web',
  inLanguage: ['ro-RO', 'en'],
  offers: {
    '@type': 'Offer',
    price: '7.00',
    priceCurrency: 'EUR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: '7.00',
      priceCurrency: 'EUR',
      unitText: 'MONTH',
    },
  },
  publisher: {
    '@type': 'Organization',
    name: 'PlanGarzi',
    url: SITE_URL,
  },
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'PlanGarzi',
  url: SITE_URL,
  inLanguage: 'ro-RO',
};

export default function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
