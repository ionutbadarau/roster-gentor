import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import BlogIndexContent from './blog-index-content';
import ro from '@/lib/i18n/ro.json';
import { createClient } from '../../../supabase/server';
import { getAllPostsSorted } from '@/content/blog/posts';

const SITE_URL = 'https://plangarzi.ro';

export const metadata: Metadata = {
  title: ro.marketing.blog.metaTitle,
  description: ro.marketing.blog.metaDescription,
  alternates: { canonical: '/blog' },
  openGraph: {
    title: ro.marketing.blog.metaTitle,
    description: ro.marketing.blog.metaDescription,
    url: `${SITE_URL}/blog`,
    type: 'website',
    locale: 'ro_RO',
    siteName: 'PlanGarzi',
  },
  twitter: {
    card: 'summary_large_image',
    title: ro.marketing.blog.metaTitle,
    description: ro.marketing.blog.metaDescription,
  },
};

export default async function BlogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  const posts = getAllPostsSorted();

  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: ro.marketing.blog.metaTitle,
    description: ro.marketing.blog.metaDescription,
    url: `${SITE_URL}/blog`,
    publisher: {
      '@type': 'Organization',
      name: 'PlanGarzi',
      url: SITE_URL,
    },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: p.publishedAt,
      dateModified: p.updatedAt,
      author: { '@type': 'Organization', name: p.author },
      url: `${SITE_URL}/blog/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <BlogIndexContent posts={posts} isLoggedIn={isLoggedIn} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
