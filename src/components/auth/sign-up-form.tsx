"use client";

import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

export function SignUpForm({ message }: { message: Message }) {
  const { t } = useTranslation();

  return (
    <form className="flex flex-col space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.signUp.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.signUp.hasAccount')}{" "}
          <Link
            className="text-primary font-medium hover:underline transition-all"
            href="/sign-in"
          >
            {t('auth.signUp.signInLink')}
          </Link>
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name" className="text-sm font-medium">
            {t('auth.signUp.fullName')}
          </Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            placeholder={t('auth.signUp.fullNamePlaceholder')}
            required
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            {t('auth.signUp.email')}
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
          <Label htmlFor="password" className="text-sm font-medium">
            {t('auth.signUp.password')}
          </Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder={t('auth.signUp.passwordPlaceholder')}
            minLength={6}
            required
            className="w-full"
          />
        </div>
      </div>

      <SubmitButton
        formAction={signUpAction}
        pendingText={t('auth.signUp.signingUp')}
        className="w-full"
      >
        {t('auth.signUp.signUpButton')}
      </SubmitButton>

      <FormMessage message={message} />
    </form>
  );
}
