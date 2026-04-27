import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../supabase/admin";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        await supabaseAdmin
          .from("subscriptions")
          .update({
            stripe_subscription_id: subscriptionId,
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", session.customer as string);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // In newer Stripe API versions, period dates moved to items.data[0]
      const item = subscription.items.data[0] as unknown as Record<string, unknown> | undefined;
      const periodStart = item?.current_period_start as number | undefined;
      const periodEnd = item?.current_period_end as number | undefined;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: subscription.status,
          current_period_start: periodStart
            ? new Date(periodStart * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", subscription.customer as string);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", subscription.customer as string);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", invoice.customer as string);

        // don't do it the Smartbill integration for now. Its too expensive
        // i'll manually create eFactura for each case. Leave the commented code for it though.
        // --- eFactura / SmartBill Integration Hook ---
        // When implementing Romanian invoicing:
        // 1. Extract: invoice.amount_paid, invoice.currency, customer email/name
        // 2. Call SmartBill API: POST https://ws.smartbill.ro/SBORO/api/invoice
        //    with your SRL's CUI, series, client details
        // 3. SmartBill auto-submits to ANAF SPV (eFactura)
        // await generateEFactura(invoice);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", invoice.customer as string);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
