import type { MetadataRoute } from 'next';

const BASE_URL = 'https://plangarzi.ro';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`,          lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/contact`,   lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/subscribe`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
