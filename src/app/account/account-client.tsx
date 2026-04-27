"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/lib/i18n";
import { createClient } from "../../../supabase/client";

export default function AccountClient({ userEmail }: { userEmail: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMatches =
    confirmEmail.trim().toLowerCase() === userEmail.toLowerCase() &&
    userEmail.length > 0;

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        setError(t("account.deleteFailed"));
        setLoading(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/?deleted=1");
      router.refresh();
    } catch {
      setError(t("account.deleteFailed"));
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("account.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("account.description")}
        </p>
      </div>

      <div className="rounded-xl border border-destructive/50 bg-card p-6 space-y-4">
        <div>
          <p className="font-medium">{t("account.deleteTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("account.deleteDescription")}
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            setConfirmEmail("");
            setError(null);
            setOpen(true);
          }}
        >
          {t("account.deleteButton")}
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!loading) setOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("account.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("account.confirmMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-email" className="text-sm">
              {t("account.confirmEmailLabel")}{" "}
              <span className="font-mono text-xs">{userEmail}</span>
            </Label>
            <Input
              id="confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={t("account.confirmEmailPlaceholder")}
              disabled={loading}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>
              {t("account.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={!emailMatches || loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading
                ? t("account.deleting")
                : t("account.confirmDeleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
