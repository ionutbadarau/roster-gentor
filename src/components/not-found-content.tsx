'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function NotFoundContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileQuestion className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('errors.notFound.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('errors.notFound.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-8 text-center">
            <p className="text-6xl font-bold text-muted-foreground">404</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/">{t('errors.notFound.returnHome')}</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
