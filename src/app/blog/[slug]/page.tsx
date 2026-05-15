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
  const ogImage = `${SITE_URL}/opengraph-image`;
  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['BlogPosting', 'Article'],
    headline: post.title,
    description: post.description,
    image: ogImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Organization', name: post.author, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'PlanGarzi',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
    inLanguage: 'ro-RO',
    keywords: post.tags.join(', '),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'PlanGarzi',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${SITE_URL}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: url,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Navbar />
      <main className="flex-1">
        <PostContent post={post} isLoggedIn={isLoggedIn} />
      </main>
      <Footer isLoggedIn={isLoggedIn} />
    </div>
  );
}
