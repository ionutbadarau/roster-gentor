import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "../../../../../supabase/admin";

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = "force-dynamic";

const WINDOW_START_HOURS = 72;
const WINDOW_END_HOURS = 96;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(
    now + WINDOW_START_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const windowEnd = new Date(
    now + WINDOW_END_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, current_period_end, renewal_reminder_sent_for_period_end",
    )
    .eq("status", "active")
    .eq("cancel_at_period_end", true)
    .gte("current_period_end", windowStart)
    .lte("current_period_end", windowEnd);

  if (error) {
    console.error("subscription-reminders: failed to query subs", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!subs?.length) {
    return NextResponse.json({ sent: 0, skipped: 0 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://plangarzi.ro";
  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    if (
      sub.renewal_reminder_sent_for_period_end === sub.current_period_end
    ) {
      skipped++;
      continue;
    }

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", sub.user_id)
      .single();

    if (!userRow?.email) {
      skipped++;
      continue;
    }

    const endDate = new Date(sub.current_period_end!).toLocaleDateString(
      "en-GB",
      { day: "2-digit", month: "long", year: "numeric" },
    );
    const greeting = userRow.full_name ? `Hi ${userRow.full_name},` : "Hi,";

    const { error: sendError } = await resend.emails.send({
      from: "PlanGarzi <contact@plangarzi.ro>",
      to: userRow.email,
      subject: "Your PlanGarzi subscription ends in 3 days",
      html: `
        <p>${greeting}</p>
        <p>Your PlanGarzi subscription is scheduled to end on <strong>${endDate}</strong>.</p>
        <p>To keep uninterrupted access to your schedules, renew before then.</p>
        <p><a href="${siteUrl}/billing">Renew your subscription</a></p>
        <p>— PlanGarzi</p>
      `,
    });

    if (sendError) {
      console.error(
        `subscription-reminders: send failed for ${sub.user_id}`,
        sendError,
      );
      skipped++;
      continue;
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        renewal_reminder_sent_for_period_end: sub.current_period_end,
      })
      .eq("user_id", sub.user_id);
    sent++;
  }

  return NextResponse.json({ sent, skipped });
}
