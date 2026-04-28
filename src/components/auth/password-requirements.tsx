"use client";

import { Check, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import {
  validatePassword,
  type PasswordIssue,
} from "@/lib/password-validation";

const RULES: { issue: PasswordIssue; key: string }[] = [
  { issue: "tooShort", key: "auth.passwordRequirements.minLength" },
  { issue: "missingUppercase", key: "auth.passwordRequirements.uppercase" },
  { issue: "missingLowercase", key: "auth.passwordRequirements.lowercase" },
  { issue: "missingDigit", key: "auth.passwordRequirements.digit" },
  { issue: "missingSymbol", key: "auth.passwordRequirements.symbol" },
  { issue: "tooCommon", key: "auth.passwordRequirements.notCommon" },
];

export function PasswordRequirements({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword?: string;
}) {
  const { t } = useTranslation();
  const issues = new Set<PasswordIssue>(validatePassword(password));
  const showMismatch =
    confirmPassword !== undefined &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
      <p className="mb-2 font-medium text-muted-foreground">
        {t("auth.passwordRequirements.title")}
      </p>
      <ul className="space-y-1">
        {RULES.map(({ issue, key }) => {
          const ok = !issues.has(issue);
          return (
            <li
              key={issue}
              className={
                "flex items-center gap-2 " +
                (ok ? "text-emerald-600" : "text-muted-foreground")
              }
            >
              {ok ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <X className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>{t(key)}</span>
            </li>
          );
        })}
        {confirmPassword !== undefined && (
          <li
            className={
              "flex items-center gap-2 " +
              (showMismatch
                ? "text-destructive"
                : confirmPassword.length > 0 && password === confirmPassword
                  ? "text-emerald-600"
                  : "text-muted-foreground")
            }
          >
            {!showMismatch &&
            confirmPassword.length > 0 &&
            password === confirmPassword ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{t("auth.passwordRequirements.mismatch")}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
