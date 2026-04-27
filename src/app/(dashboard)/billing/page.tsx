import { redirect } from "next/navigation";
import { createClient } from "../../../../supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import BillingClient from "./billing-client";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const status = await getSubscriptionStatus(user.id);

  if (status.access !== "active" && status.access !== "past_due") {
    return redirect("/subscribe");
  }

  return <BillingClient />;
}
