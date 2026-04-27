"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SubscriptionEndBannerProps {
  endDate: string;
}

export default function SubscriptionEndBanner({
  endDate,
}: SubscriptionEndBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useTranslation();

  if (dismissed) return null;

  const end = new Date(endDate);
  const daysRemaining = Math.ceil(
    (end.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const formatted = end.toLocaleDateString();
  const variant = daysRemaining <= 3 ? "destructive" : "warning";

  async function handleRenew() {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  return (
    <div
      className={cn(
        "w-full px-4 py-2 flex items-center justify-center gap-4 text-sm",
        variant === "destructive" &&
          "bg-red-500/10 text-red-700 dark:text-red-400",
        variant === "warning" &&
          "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      )}
    >
      <span>{t("billing.cancelAtPeriodEnd", { date: formatted })}</span>
      <Button variant="outline" size="sm" onClick={handleRenew}>
        {t("billing.manageSubscription")}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 opacity-60 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
