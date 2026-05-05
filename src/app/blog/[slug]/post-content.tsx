'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Calendar, Clock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { BlogBlock, BlogPost } from '@/content/blog/posts';

const INLINE_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  INLINE_LINK_RE.lastIndex = 0;
  while ((match = INLINE_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, label, href] = match;
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
      parts.push(
        <a
          key={`l${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0F6E56] dark:text-[#1D9E75] hover:underline font-medium"
        >
          {label}
        </a>
      );
    } else {
      parts.push(
        <Link
          key={`l${key++}`}
          href={href}
          className="text-[#0F6E56] dark:text-[#1D9E75] hover:underline font-medium"
        >
          {label}
        </Link>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function renderBlock(block: BlogBlock, idx: number): React.ReactNode {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          key={idx}
          id={block.id}
          className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mt-12 mb-4 scroll-mt-24"
        >
          {block.text}
        </h2>
      );
    case 'p':
      return (
        <p key={idx} className="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-5">
          {renderInline(block.text)}
        </p>
      );
    case 'ul':
      return (
        <ul key={idx} className="list-disc list-outside pl-6 mb-5 space-y-2 text-base md:text-lg text-gray-700 dark:text-gray-300">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote
          key={idx}
          className="border-l-4 border-[#0F6E56] dark:border-[#1D9E75] pl-5 py-2 my-6 italic text-gray-700 dark:text-gray-300"
        >
          {renderInline(block.text)}
        </blockquote>
      );
  }
}

export default function PostContent({
  post,
}: {
  post: BlogPost;
  isLoggedIn?: boolean;
}) {
  const { t, language } = useTranslation();
  const dateLocale = language === 'en' ? 'en-US' : 'ro-RO';

  const formattedDate = new Date(post.publishedAt).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="container mx-auto px-4 py-16 md:py-20 max-w-3xl">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-[#0F6E56] dark:hover:text-[#1D9E75] mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('marketing.blog.backToBlog')}
      </Link>

      <header className="mb-10 pb-8 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
          {post.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {t('marketing.blog.publishedOn')} {formattedDate}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            {post.readingMinutes} {t('marketing.blog.minutesRead')}
          </span>
          <span>
            {t('marketing.blog.by')} {post.author}
          </span>
        </div>
      </header>

      <div>
        {post.body.map((block, idx) => renderBlock(block, idx))}
      </div>

      <aside className="mt-16 rounded-2xl bg-gradient-to-br from-[#0F6E56]/5 to-[#1D9E75]/10 dark:from-[#0A3D31]/30 dark:to-[#0F6E56]/30 border border-[#0F6E56]/20 dark:border-[#0F6E56]/40 p-8 md:p-10 text-center">
        <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3">
          {t('marketing.blog.ctaTitle')}
        </h3>
        <p className="text-gray-700 dark:text-gray-300 mb-6 max-w-xl mx-auto">
          {t('marketing.blog.ctaBody')}
        </p>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-2 bg-[#0F6E56] hover:bg-[#0A3D31] text-white font-medium px-6 py-3 rounded-lg transition-colors shadow-lg shadow-[#0F6E56]/30"
        >
          {t('marketing.blog.ctaButton')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </aside>
    </article>
  );
}
