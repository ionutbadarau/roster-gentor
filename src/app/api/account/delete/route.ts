import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "../../../../../supabase/server";
import { supabaseAdmin } from "../../../../../supabase/admin";
import { stripe } from "@/lib/stripe";

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendGoodbyeEmail(to: string, fullName: string | null) {
  const greeting = fullName ? `Hi ${fullName},` : "Hi,";
  try {
    const { error } = await resend.emails.send({
      from: "PlanGarzi <contact@plangarzi.ro>",
      to,
      subject: "Your PlanGarzi account has been deleted",
      html: `
        <p>${greeting}</p>
        <p>We're sad to see you leave. Your PlanGarzi account and all associated data have been permanently deleted, and any active subscription has been canceled.</p>
        <p>If you ever change your mind, you're welcome to sign up again at <a href="https://plangarzi.ro">plangarzi.ro</a>.</p>
        <p>If you have a moment, we'd love to hear what we could have done better — just reply to this email.</p>
        <p>Thank you for trying PlanGarzi.</p>
        <p>— The PlanGarzi team</p>
      `,
    });
    if (error) {
      console.error("[delete-account] goodbye email send failed:", error);
    }
  } catch (e) {
    console.error("[delete-account] goodbye email exception:", e);
  }
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (sub?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (e: any) {
      if (e?.statusCode !== 404) {
        console.error("[delete-account] stripe subscription cancel:", e);
      }
    }
  }

  if (sub?.stripe_customer_id) {
    try {
      await stripe.customers.del(sub.stripe_customer_id);
    } catch (e: any) {
      if (e?.statusCode !== 404) {
        console.error("[delete-account] stripe customer delete:", e);
      }
    }
  }

  if (user.email) {
    await sendGoodbyeEmail(user.email, userRow?.full_name ?? null);
  }

  await supabaseAdmin.from("users").delete().eq("user_id", user.id);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[delete-account] auth.admin.deleteUser:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
