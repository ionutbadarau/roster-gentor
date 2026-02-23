"use client";

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

export function SignInForm({ message }: { message: Message }) {
  const { t } = useTranslation();

  return (
    <form className="flex flex-col space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.signIn.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.signIn.noAccount')}{" "}
          <Link
            className="text-primary font-medium hover:underline transition-all"
            href="/sign-up"
          >
            {t('auth.signIn.signUpLink')}
          </Link>
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            {t('auth.signIn.email')}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password" className="text-sm font-medium">
              {t('auth.signIn.password')}
            </Label>
            <Link
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-all"
              href="/forgot-password"
            >
              {t('auth.signIn.forgotPassword')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder={t('auth.signIn.passwordPlaceholder')}
            required
            className="w-full"
          />
        </div>
      </div>

      <SubmitButton
        className="w-full"
        pendingText={t('auth.signIn.signingIn')}
        formAction={signInAction}
      >
        {t('auth.signIn.signInButton')}
      </SubmitButton>

      <FormMessage message={message} />
    </form>
  );
}
