import { createClient } from "../../../supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import SubscribeClient from "./subscribe-client";

export default async function SubscribePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SubscribeClient variant="expired" />;
  }

  const status = await getSubscriptionStatus(user.id);

  if (status.access === "trial") {
    return (
      <SubscribeClient variant="trial" daysRemaining={status.daysRemaining} />
    );
  }

  return <SubscribeClient variant="expired" />;
}
