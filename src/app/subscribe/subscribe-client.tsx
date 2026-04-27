"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type Plan = "monthly" | "yearly";

interface SubscribeClientProps {
  variant: "trial" | "expired";
  daysRemaining?: number;
}

export default function SubscribeClient({
  variant,
  daysRemaining,
}: SubscribeClientProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan>("monthly");

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  const features = [
    t("billing.paywall.feature1"),
    t("billing.paywall.feature2"),
    t("billing.paywall.feature3"),
    t("billing.paywall.feature4"),
  ];

  const title =
    variant === "trial"
      ? t("billing.paywall.titleTrial")
      : t("billing.paywall.title");

  const description =
    variant === "trial"
      ? t("billing.paywall.descriptionTrial", { days: daysRemaining ?? 0 })
      : t("billing.paywall.description");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="w-full border-b border-border bg-background py-4">
        <div className="container mx-auto px-4">
          <Link href="/" prefetch>
            <Image
              src="/plangarzi-logo.svg"
              alt="PlanGarzi"
              width={160}
              height={48}
              priority
            />
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>

          <div className="rounded-xl border bg-card p-8 space-y-6">
            <div className="inline-flex rounded-lg border p-1 bg-muted/30 w-full">
              <button
                type="button"
                onClick={() => setPlan("monthly")}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition ${
                  plan === "monthly"
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {t("billing.monthly")}
              </button>
              <button
                type="button"
                onClick={() => setPlan("yearly")}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition ${
                  plan === "yearly"
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {t("billing.yearly")}{" "}
                <span className="text-green-600 text-xs">
                  {t("billing.yearlyBadge")}
                </span>
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {t("billing.planName")}
              </p>
              {plan === "monthly" ? (
                <p className="text-4xl font-bold">
                  $7
                  <span className="text-base font-normal text-muted-foreground">
                    /{t("billing.month")}
                  </span>
                </p>
              ) : (
                <>
                  <p className="text-4xl font-bold">
                    $5
                    <span className="text-base font-normal text-muted-foreground">
                      /{t("billing.month")}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.yearlyBilled")}
                  </p>
                </>
              )}
            </div>

            <ul className="text-left space-y-3">
              {features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading
                ? t("billing.paywall.processing")
                : plan === "yearly"
                  ? t("billing.paywall.ctaYearly")
                  : t("billing.paywall.ctaMonthly")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("billing.paywall.contactSupport")}{" "}
            <Link href="/contact" className="underline">
              {t("billing.paywall.contactLink")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
