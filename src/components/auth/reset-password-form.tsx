"use client";

import { resetPasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import { isPasswordStrong, PASSWORD_MIN_LENGTH } from "@/lib/password-validation";
import { useState } from "react";
import { PasswordRequirements } from "@/components/auth/password-requirements";

export function ResetPasswordForm({
  message,
  code = "",
  mode = "recovery",
}: {
  message: Message;
  code?: string;
  mode?: "recovery" | "in-app";
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const canSubmit =
    isPasswordStrong(password) &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const titleKey =
    mode === "in-app"
      ? "auth.resetPassword.titleInApp"
      : "auth.resetPassword.title";
  const descriptionKey =
    mode === "in-app"
      ? "auth.resetPassword.descriptionInApp"
      : "auth.resetPassword.description";

  return (
    <form className="flex flex-col space-y-6">
      <input type="hidden" name="code" value={code} />
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t(titleKey)}</h1>
        <p className="text-sm text-muted-foreground">
          {t(descriptionKey)}
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
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full"
          />
        </div>

        <PasswordRequirements
          password={password}
          confirmPassword={confirmPassword}
        />
      </div>

      <SubmitButton
        formAction={resetPasswordAction}
        pendingText={t('auth.resetPassword.resetting')}
        className="w-full"
        disabled={!canSubmit}
      >
        {t('auth.resetPassword.resetButton')}
      </SubmitButton>

      <FormMessage message={message} />
    </form>
  );
}
