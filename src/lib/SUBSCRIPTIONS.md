# Subscriptions / Billing

Stripe-backed subscription gating with 90-day trial. Source of truth: `public.subscriptions` table in Supabase.

## Files

| File | Role |
|------|------|
| `src/lib/stripe.ts` | Stripe client + price-id resolver. Reads `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (monthly), `STRIPE_PRICE_ID_YEARLY` |
| `src/lib/subscription.ts` | `getSubscriptionStatus(userId)` → discriminated union. Lazy-provisions row + Stripe customer for pre-existing users |
| `supabase/admin.ts` | Service-role Supabase client. Bypasses RLS. Use only server-side for `subscriptions` writes |
| `supabase/migrations/20260416_add_subscriptions.sql` | Schema + RLS policies (user reads own row, service_role writes) |
| `src/app/actions.ts` | Sign-up flow: creates Stripe customer + `subscriptions` row with 90-day trial |
| `src/app/api/stripe/checkout/route.ts` | POST `{plan: "monthly"\|"yearly"}` → Stripe Checkout session URL |
| `src/app/api/stripe/portal/route.ts` | POST → Stripe Billing Portal URL (manage/cancel/update payment) |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook receiver. Updates row on `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_succeeded/failed` |
| `src/app/subscribe/page.tsx` + `subscribe-client.tsx` | Paywall page. Plan toggle (monthly/yearly), CTA → checkout |
| `src/app/(dashboard)/billing/page.tsx` | In-app billing page. Buttons → checkout / portal |
| `src/app/(dashboard)/layout.tsx` | Gate: calls `getSubscriptionStatus`. Expired/canceled → redirect `/subscribe`. Trial/past_due → render `TrialBanner`. Active+`cancel_at_period_end` → render `SubscriptionEndBanner` |
| `src/components/trial-banner.tsx` | Top banner showing days left or past-due warning |
| `src/components/subscription-end-banner.tsx` | Top banner shown to active subs with `cancel_at_period_end=true`, links to Stripe portal to renew |
| `src/app/api/cron/subscription-reminders/route.ts` | Daily cron. Emails users whose sub ends in ~3 days and has `cancel_at_period_end=true`. Dedupes via `renewal_reminder_sent_for_period_end` column |
| `src/app/api/account/delete/route.ts` | POST. Cancels Stripe subscription, deletes Stripe customer, sends goodbye email via Resend, deletes `public.users` row, then `auth.admin.deleteUser` (cascade wipes the rest) |
| `src/app/account/` | User-facing account deletion page (layout + page + `account-client.tsx`). Lives outside `(dashboard)` so the subscription gate doesn't block canceled users |

## Status state machine

`getSubscriptionStatus()` returns one of:

- `trial` — `status='trialing'` and `trial_ends_at > now`. `daysRemaining` derived.
- `active` — `status='active'`. `currentPeriodEnd`, `cancelAtPeriodEnd` from row.
- `past_due` — `status='past_due'`. 14-day grace window after `current_period_end`; beyond that → `expired`.
- `expired` — trial ran out OR past-due grace exhausted.
- `canceled` — `canceled` / `unpaid` / `incomplete`.

Constants in `subscription.ts`: `TRIAL_DURATION_DAYS=90`, `PAST_DUE_GRACE_PERIOD_DAYS=14`.

## Lazy provisioning

If `subscriptions` row missing for a user (existed before migration), `lazyProvision()`:
1. Reads `email`, `created_at` from `users`.
2. Creates Stripe customer with metadata `{supabase_user_id}`.
3. Inserts row with `trial_ends_at = created_at + 90d`.

Sign-up flow (`actions.ts`) does the same eagerly; lazy is fallback.

## Webhook events handled

| Event | Effect on `subscriptions` row |
|-------|-------------------------------|
| `checkout.session.completed` | set `stripe_subscription_id`, `status='active'` |
| `customer.subscription.updated` | sync `status`, `current_period_start/end` (read from `items.data[0]` in newer API), `cancel_at_period_end` |
| `customer.subscription.deleted` | `status='canceled'` |
| `invoice.payment_succeeded` | `status='active'`. eFactura/SmartBill hook left commented |
| `invoice.payment_failed` | `status='past_due'` |

Row lookup key in webhook handlers: `stripe_customer_id` (not `user_id`).

## Pricing

Hardcoded display: $7/mo or $5/mo billed yearly. Real prices come from Stripe price IDs in env. Public business name shown on Checkout = Stripe Dashboard → Settings → Public details.

## Env vars

```
STRIPE_SECRET_KEY
STRIPE_PRICE_ID            # monthly
STRIPE_PRICE_ID_YEARLY     # yearly
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_SITE_URL       # used for success/cancel/return URLs
SUPABASE_SERVICE_ROLE_KEY  # used by supabase/admin.ts
RESEND_API_KEY             # used by cron to send renewal reminders
CRON_SECRET                # Bearer token Vercel cron sends; also required for local curl tests
```

## Renewal reminder cron

`vercel.json` registers a daily cron at 09:00 UTC hitting `/api/cron/subscription-reminders`. Vercel forwards `Authorization: Bearer ${CRON_SECRET}`.

Selection: `status='active' AND cancel_at_period_end=true AND current_period_end ∈ [now+72h, now+96h]` — auto-renewing subs are excluded (Stripe handles those silently). Dedup via `renewal_reminder_sent_for_period_end` column (stores the `current_period_end` value at send time; re-arms automatically on the next period).

Local test:
```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/subscription-reminders
```
Returns `{ sent, skipped }`.

## Account deletion

Triggered from `/account`. `POST /api/account/delete` runs in this order:

1. `stripe.subscriptions.cancel(stripe_subscription_id)` if set. 404 swallowed.
2. `stripe.customers.del(stripe_customer_id)` if set. 404 swallowed.
3. Resend goodbye email to `user.email` (logs and continues on failure — never blocks deletion).
4. `delete from public.users where user_id = $uid` (not FK-cascaded to `auth.users`).
5. `supabaseAdmin.auth.admin.deleteUser(user.id)`. Cascade removes `subscriptions`, `doctors`, `teams`, `national_holidays`, `schedule_config`, `schedule_share_tokens`. `shifts` and `leave_days` cascade transitively via `doctors`.

UI confirmation: user must type their own email before the destructive button enables (see `src/app/account/account-client.tsx`). On success the client calls `supabase.auth.signOut()` and routes to `/?deleted=1`; landing renders `<AccountDeletedToast />`.

## Tests

- `src/lib/__tests__/stripe.test.ts`
- `src/app/api/stripe/__tests__/checkout.test.ts`
- `src/app/api/stripe/__tests__/webhook.test.ts`

Run: `npx vitest run`.
