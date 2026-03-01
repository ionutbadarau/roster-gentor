'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Users, BarChart3, Grid3X3 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard/summary', key: 'tabDashboard', icon: BarChart3 },
  { href: '/dashboard/grid', key: 'tabGrid', icon: Grid3X3 },
  { href: '/dashboard/doctors', key: 'tabDoctors', icon: Users },
  { href: '/dashboard/config', key: 'tabConfig', icon: Settings },
] as const;

export default function DashboardTabs() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="grid w-full grid-cols-4 mb-6 bg-muted p-1 rounded-lg">
      {tabs.map(({ href, key, icon: Icon }) => {
        const isActive = pathname === href || (href === '/dashboard/grid' && pathname === '/dashboard');
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
