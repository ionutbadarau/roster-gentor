import { stripe, resolvePriceId, type BillingInterval } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { supabaseAdmin } from "../../../../../supabase/admin";

export async function POST(req: Request) {
  let interval: BillingInterval = "monthly";
  try {
    const body = await req.json();
    if (body?.plan === "yearly") interval = "yearly";
  } catch {}

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "No subscription record found" },
      { status: 400 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: subscription.stripe_customer_id,
    mode: "subscription",
    line_items: [{ price: resolvePriceId(interval), quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/grid?subscription=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
    metadata: { user_id: user.id },
    subscription_data: {
      metadata: { user_id: user.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
