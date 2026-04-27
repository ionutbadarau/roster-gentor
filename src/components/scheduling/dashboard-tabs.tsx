'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Grid3X3 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/grid', key: 'tabGrid', icon: Grid3X3 },
  { href: '/config', key: 'tabConfig', icon: Settings },
] as const;

export default function DashboardTabs() {
  const pathname = usePathname();
  const { t } = useTranslation();

  if (pathname === '/billing') return null;

  return (
    <div className="grid w-full grid-cols-2 mb-6 bg-muted p-1 rounded-lg">
      {tabs.map(({ href, key, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t(`scheduling.dashboard.${key}`)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
