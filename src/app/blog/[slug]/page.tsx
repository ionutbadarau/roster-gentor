import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import PostContent from './post-content';
import ro from '@/lib/i18n/ro.json';
import { createClient } from '../../../../supabase/server';
import { blogPosts, getPostBySlug } from '@/content/blog/posts';

const SITE_URL = 'https://plangarzi.ro';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: ro.marketing.blog.metaTitle,
      description: ro.marketing.blog.metaDescription,
    };
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} — PlanGarzi`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: 'article',
      locale: 'ro_RO',
      siteName: 'PlanGarzi',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  const url = `${SITE_URL}/blog/${post.slug}`;
  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'PlanGarzi',
      url: SITE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
    inLanguage: 'ro-RO',
    keywords: post.tags.join(', '),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <PostContent post={post} isLoggedIn={isLoggedIn} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
