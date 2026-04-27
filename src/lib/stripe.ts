import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

export const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID!;
export const PRICE_ID_YEARLY = process.env.STRIPE_PRICE_ID_YEARLY!;
export const PRICE_ID = PRICE_ID_MONTHLY;

export type BillingInterval = "monthly" | "yearly";

export function resolvePriceId(interval: BillingInterval): string {
  const id = interval === "yearly" ? PRICE_ID_YEARLY : PRICE_ID_MONTHLY;
  if (!id) {
    throw new Error(
      `Missing Stripe price env var for ${interval} plan (set ${
        interval === "yearly" ? "STRIPE_PRICE_ID_YEARLY" : "STRIPE_PRICE_ID"
      })`,
    );
  }
  return id;
}
