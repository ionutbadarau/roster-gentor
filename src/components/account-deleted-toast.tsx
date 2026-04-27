"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function AccountDeletedToast() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (params.get("deleted") === "1") {
      setVisible(true);
      router.replace("/", { scroll: false });
    }
  }, [params, router]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/40 px-4 py-3 shadow-lg max-w-sm">
      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-green-900 dark:text-green-100 flex-1">
        {t("account.deletedToast")}
      </p>
      <button
        onClick={() => setVisible(false)}
        className="text-green-900/60 dark:text-green-100/60 hover:text-green-900 dark:hover:text-green-100"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
