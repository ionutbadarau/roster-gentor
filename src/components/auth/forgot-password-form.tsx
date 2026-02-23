"use client";

import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

export function ForgotPasswordForm({ message }: { message: Message }) {
  const { t } = useTranslation();

  return (
    <form className="flex flex-col space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.forgotPassword.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.forgotPassword.hasAccount')}{" "}
          <Link
            className="text-primary font-medium hover:underline transition-all"
            href="/sign-in"
          >
            {t('auth.forgotPassword.signInLink')}
          </Link>
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            {t('auth.forgotPassword.email')}
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
      </div>

      <SubmitButton
        formAction={forgotPasswordAction}
        pendingText={t('auth.forgotPassword.sendingReset')}
        className="w-full"
      >
        {t('auth.forgotPassword.resetButton')}
      </SubmitButton>

      <FormMessage message={message} />
    </form>
  );
}
