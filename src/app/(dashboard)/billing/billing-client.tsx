"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { CreditCard, ExternalLink } from "lucide-react";

export default function BillingClient() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);

  async function openPortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("billing.billingTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("billing.billingDescription")}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{t("billing.planName")}</p>
            <p className="text-sm text-muted-foreground">
              {t("billing.priceMonthly")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={openPortal}
            disabled={loading === "portal"}
            variant="outline"
          >
            {t("billing.manageSubscription")}
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
