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
    'Aplicație web pentru planificarea automată a gărzilor și turelor pentru orice echipă cu program rotativ — spitale, pompieri, paramedici, asistenți medicali, agenții de securitate, dispecerate 24/7. Generează programul lunar respectând perioadele de odihnă, distribuie echitabil turele și exportă în PDF sau Excel.',
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

const faqPage = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  inLanguage: 'ro-RO',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Pentru cine este PlanGarzi?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Pentru orice organizație care planifică ture rotative lunare — spitale, secții medicale, stații de pompieri, echipaje de paramedici, ture de asistenți medicali, agenții de securitate, dispecerate 24/7. Algoritmul nu este legat de o specialitate anume; regulile (durata turei, perioada de odihnă, norma lunară) se configurează per organizație.',
      },
    },
    {
      '@type': 'Question',
      name: 'Cum funcționează planificarea gărzilor în PlanGarzi?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Definești echipele rotative și membrii flotanți, marchezi zilele de concediu și apeși "Generează". Algoritmul construiește programul lunar respectând perioadele de odihnă (24h după turele de zi, 48h după turele de noapte) și plafonul săptămânal de 48h. Poți edita manual orice tură după generare.',
      },
    },
    {
      '@type': 'Question',
      name: 'PlanGarzi respectă normele legale pentru ture și perioade de odihnă?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. Algoritmul aplică perioadele obligatorii de odihnă, plafonul săptămânal de 48h și norma lunară minimă (7 ore × numărul de zile lucrătoare). Conflictele sunt detectate automat și marcate vizual pe celulele afectate.',
      },
    },
    {
      '@type': 'Question',
      name: 'Pot exporta programul de gărzi în Excel sau PDF?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. Exporți programul lunar în PDF pentru afișare la avizier sau în Excel pentru raportare la HR. Poți trimite și un link personal fiecărui membru al echipei pe email — linkul deschide direct turele lui, fără cont sau autentificare.',
      },
    },
    {
      '@type': 'Question',
      name: 'Cât durează generarea unui program lunar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Câteva secunde. Pentru o echipă tipică de 15–25 de persoane, generatorul produce un draft complet în sub 5 secunde — față de 4–12 ore de muncă manuală în Excel.',
      },
    },
    {
      '@type': 'Question',
      name: 'Pot încerca PlanGarzi gratuit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. Toate conturile noi primesc 90 de zile de probă gratuită, fără card de credit. După proba gratuită, abonamentul lunar costă €7 (sau €5/lună facturat anual). Anulezi oricând.',
      },
    },
    {
      '@type': 'Question',
      name: 'Pot trimite programul echipei pe email?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. Fiecare membru al echipei primește un email cu link personal de vizualizare. Linkul nu cere autentificare: îl deschide pe orice dispozitiv și vede direct turele lui din luna respectivă, cu opțiune de export PDF.',
      },
    },
    {
      '@type': 'Question',
      name: 'Funcționează pentru orice tip de tură (12h, 24h)?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. PlanGarzi suportă ture de 12 ore (zi 08:00–20:00 și noapte 20:00–08:00) și gărzi de 24 de ore. Configurezi tipul de tură per echipă, iar algoritmul aplică perioadele de odihnă corespunzătoare.',
      },
    },
    {
      '@type': 'Question',
      name: 'Datele mele sunt în siguranță și conforme cu GDPR?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da. Datele sunt stocate criptat pe Supabase (PostgreSQL gestionat în UE), accesibile doar contului tău. Poți șterge complet contul oricând, ceea ce elimină toate datele asociate. Politica de confidențialitate este disponibilă la /privacy.',
      },
    },
  ],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}
