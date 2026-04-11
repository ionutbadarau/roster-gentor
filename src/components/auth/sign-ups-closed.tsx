"use client";

import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

export function SignUpsClosed() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('auth.signUp.closedTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.signUp.closedBody')}
        </p>
      </div>

      <Link
        href="/sign-in"
        className="text-primary font-medium hover:underline transition-all text-sm"
      >
        {t('auth.signUp.backToSignIn')}
      </Link>
    </div>
  );
}
