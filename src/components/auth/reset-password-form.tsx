"use client";

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";

export function ResetPasswordForm({ message }: { message: Message }) {
  const { t } = useTranslation();

  return (
    <form className="flex flex-col space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.resetPassword.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.resetPassword.description')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            {t('auth.resetPassword.newPassword')}
          </Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
            required
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            {t('auth.resetPassword.confirmPassword')}
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
            required
            className="w-full"
          />
        </div>
      </div>

      <SubmitButton
        formAction={resetPasswordAction}
        pendingText={t('auth.resetPassword.resetting')}
        className="w-full"
      >
        {t('auth.resetPassword.resetButton')}
      </SubmitButton>

      <FormMessage message={message} />
    </form>
  );
}
