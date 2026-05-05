import type { MetadataRoute } from 'next';

const BASE_URL = 'https://plangarzi.ro';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`,          lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/pricing`,   lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/features`,  lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/contact`,   lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/subscribe`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/privacy`,   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];
}
