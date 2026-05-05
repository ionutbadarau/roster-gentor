'use client';

import Link from 'next/link';
import { ArrowRight, Calendar, Clock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { BlogPost } from '@/content/blog/posts';

export default function BlogIndexContent({
  posts,
}: {
  posts: BlogPost[];
  isLoggedIn?: boolean;
}) {
  const { t, language } = useTranslation();
  const dateLocale = language === 'en' ? 'en-US' : 'ro-RO';

  return (
    <section className="container mx-auto px-4 py-16 md:py-24 max-w-5xl">
      <header className="mb-12 md:mb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
          {t('marketing.blog.h1')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('marketing.blog.intro')}
        </p>
      </header>

      <div className="grid gap-8 md:gap-10">
        {posts.map((post) => {
          const formattedDate = new Date(post.publishedAt).toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });

          return (
            <article
              key={post.slug}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 md:p-8 hover:border-[#0F6E56] dark:hover:border-[#1D9E75] hover:shadow-lg transition-all"
            >
              <Link href={`/blog/${post.slug}`} className="block">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-[#0F6E56] dark:group-hover:text-[#1D9E75] transition-colors">
                  {post.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                  {post.description}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-500 mb-4">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formattedDate}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {post.readingMinutes} {t('marketing.blog.minutesRead')}
                  </span>
                  <span>
                    {t('marketing.blog.by')} {post.author}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[#0F6E56] dark:text-[#1D9E75] font-medium">
                  {t('marketing.blog.readMore')}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
