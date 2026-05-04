'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/lib/i18n';
import { useConsent } from '@/lib/consent';

export function CookieBanner() {
  const { t } = useTranslation();
  const { consent, mounted, acceptAll, rejectAll, save } = useConsent();
  const [manageOpen, setManageOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);

  if (!mounted || consent !== null) return null;

  const openManage = () => {
    setAnalyticsDraft(false);
    setManageOpen(true);
  };

  const handleSave = () => {
    save({ analytics: analyticsDraft });
    setManageOpen(false);
  };

  return (
    <>
      <div
        role="dialog"
        aria-label={t('marketing.consent.banner.title')}
        className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg"
      >
        <div className="container mx-auto max-w-5xl px-4 py-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {t('marketing.consent.banner.title')}
            </p>
            <p className="mt-1">
              {t('marketing.consent.banner.description')}{' '}
              <Link href="/privacy" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
                {t('marketing.consent.banner.linkText')}
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
            <Button variant="default" onClick={acceptAll}>
              {t('marketing.consent.actions.acceptAll')}
            </Button>
            <Button variant="default" onClick={rejectAll}>
              {t('marketing.consent.actions.rejectAll')}
            </Button>
            <Button variant="default" onClick={openManage}>
              {t('marketing.consent.actions.manage')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('marketing.consent.dialog.title')}</DialogTitle>
            <DialogDescription>{t('marketing.consent.dialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{t('marketing.consent.categories.necessary.name')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('marketing.consent.categories.necessary.description')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch checked disabled aria-label={t('marketing.consent.categories.necessary.alwaysOn')} />
                <span className="text-xs text-muted-foreground">
                  {t('marketing.consent.categories.necessary.alwaysOn')}
                </span>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{t('marketing.consent.categories.analytics.name')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('marketing.consent.categories.analytics.description')}
                </p>
              </div>
              <Switch
                checked={analyticsDraft}
                onCheckedChange={setAnalyticsDraft}
                aria-label={t('marketing.consent.categories.analytics.name')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              {t('marketing.consent.actions.close')}
            </Button>
            <Button onClick={handleSave}>{t('marketing.consent.actions.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
