"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface TrialBannerProps {
  daysRemaining: number;
  isPastDue?: boolean;
}

export default function TrialBanner({
  daysRemaining,
  isPastDue,
}: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useTranslation();

  if (dismissed) return null;

  const variant = isPastDue
    ? "destructive"
    : daysRemaining <= 7
      ? "destructive"
      : daysRemaining <= 30
        ? "warning"
        : "info";

  async function handleAction() {
    if (isPastDue) {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } else {
      window.location.href = "/subscribe";
    }
  }

  const message = isPastDue
    ? t("billing.pastDue")
    : t("billing.trialBanner", { days: daysRemaining });

  const actionLabel = isPastDue
    ? t("billing.updatePaymentMethod")
    : t("billing.subscribe");

  return (
    <div
      className={cn(
        "w-full px-4 py-2 flex items-center justify-center gap-4 text-sm",
        variant === "destructive" && "bg-red-500/10 text-red-700 dark:text-red-400",
        variant === "warning" && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
        variant === "info" && "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      )}
    >
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={handleAction}>
        {actionLabel}
      </Button>
      {!isPastDue && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 opacity-60 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
