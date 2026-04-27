import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "../../supabase/admin";

export type SubscriptionStatus =
  | { access: "trial"; daysRemaining: number; trialEndsAt: string }
  | {
      access: "active";
      currentPeriodEnd: string;
      cancelAtPeriodEnd: boolean;
    }
  | { access: "past_due"; currentPeriodEnd: string }
  | { access: "expired" }
  | { access: "canceled" };

const TRIAL_DURATION_DAYS = 90;
const PAST_DUE_GRACE_PERIOD_DAYS = 14;

/**
 * Get subscription status for a user. Handles lazy provisioning
 * for users who signed up before the subscriptions table existed.
 */
export async function getSubscriptionStatus(
  userId: string,
): Promise<SubscriptionStatus> {
  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!subscription) {
    return lazyProvision(userId);
  }

  const now = new Date();

  if (subscription.status === "trialing") {
    const trialEnd = new Date(subscription.trial_ends_at);
    if (trialEnd > now) {
      const daysRemaining = Math.ceil(
        (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        access: "trial",
        daysRemaining,
        trialEndsAt: subscription.trial_ends_at,
      };
    }
    return { access: "expired" };
  }

  if (subscription.status === "active") {
    return {
      access: "active",
      currentPeriodEnd: subscription.current_period_end!,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    };
  }

  if (subscription.status === "past_due") {
    if (subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      const graceDeadline = new Date(
        periodEnd.getTime() + PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );
      if (now > graceDeadline) {
        return { access: "expired" };
      }
    }
    return {
      access: "past_due",
      currentPeriodEnd: subscription.current_period_end!,
    };
  }

  // canceled, unpaid, incomplete
  return { access: "canceled" };
}

/**
 * Lazy provision: create Stripe customer + subscription row for
 * users who existed before the subscriptions migration.
 */
async function lazyProvision(userId: string): Promise<SubscriptionStatus> {
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  if (!user) {
    return { access: "expired" };
  }

  const trialEndsAt = new Date(
    Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: userId },
  });

  await supabaseAdmin.from("subscriptions").insert({
    user_id: userId,
    stripe_customer_id: customer.id,
    status: "trialing",
    trial_ends_at: trialEndsAt.toISOString(),
  });

  const now = new Date();
  if (trialEndsAt > now) {
    const daysRemaining = Math.ceil(
      (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      access: "trial",
      daysRemaining,
      trialEndsAt: trialEndsAt.toISOString(),
    };
  }

  return { access: "expired" };
}
