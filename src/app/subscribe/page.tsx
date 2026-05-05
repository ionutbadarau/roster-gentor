import { createClient } from "../../../supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import SubscribeClient from "./subscribe-client";

type Plan = "monthly" | "yearly";

function parsePlan(value: string | string[] | undefined): Plan | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "monthly" || v === "yearly" ? v : undefined;
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initialPlan = parsePlan((await searchParams).plan);

  if (!user) {
    return (
      <SubscribeClient
        variant="expired"
        isAuthed={false}
        initialPlan={initialPlan}
      />
    );
  }

  const status = await getSubscriptionStatus(user.id);

  if (status.access === "trial") {
    return (
      <SubscribeClient
        variant="trial"
        daysRemaining={status.daysRemaining}
        isAuthed
        initialPlan={initialPlan}
      />
    );
  }

  return <SubscribeClient variant="expired" isAuthed initialPlan={initialPlan} />;
}
