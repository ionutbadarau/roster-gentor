"use client";

import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import { createClient } from "../../../supabase/client";
import Link from "next/link";
import { useState } from "react";

export function SignInForm({ message }: { message: Message }) {
  const { t } = useTranslation();
  const signUpsEnabled = process.env.NEXT_PUBLIC_SIGNUPS_ENABLED === 'true';
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      return;
    }

    window.location.href = '/grid';
  };

  return (
    <form className="flex flex-col space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.signIn.title')}</h1>
        {signUpsEnabled && (
          <p className="text-sm text-muted-foreground">
            {t('auth.signIn.noAccount')}{" "}
            <Link
              className="text-primary font-medium hover:underline transition-all"
              href="/sign-up"
            >
              {t('auth.signIn.signUpLink')}
            </Link>
          </p>
        )}
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
        formAction={handleSubmit}
      >
        {t('auth.signIn.signInButton')}
      </SubmitButton>

      {error && <FormMessage message={{ error }} />}
      {!error && <FormMessage message={message} />}
    </form>
  );
}
