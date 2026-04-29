import type { MetadataRoute } from 'next';

const BASE_URL = 'https://plangarzi.ro';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/grid',
          '/config',
          '/billing',
          '/account',
          '/api/',
          '/schedule/view',
          '/sign-in',
          '/sign-up',
          '/forgot-password',
          '/reset-password',
          '/auth/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
