import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_PRICE_ID = "price_monthly_dummy";
  process.env.STRIPE_PRICE_ID_YEARLY = "price_yearly_dummy";
});

describe("resolvePriceId", () => {
  it("returns the monthly price ID when interval is 'monthly'", async () => {
    const { resolvePriceId } = await import("@/lib/stripe");
    expect(resolvePriceId("monthly")).toBe("price_monthly_dummy");
  });

  it("returns the yearly price ID when interval is 'yearly'", async () => {
    const { resolvePriceId } = await import("@/lib/stripe");
    expect(resolvePriceId("yearly")).toBe("price_yearly_dummy");
  });

  it("exposes both PRICE_ID_MONTHLY and PRICE_ID_YEARLY constants", async () => {
    const { PRICE_ID_MONTHLY, PRICE_ID_YEARLY, PRICE_ID } = await import(
      "@/lib/stripe"
    );
    expect(PRICE_ID_MONTHLY).toBe("price_monthly_dummy");
    expect(PRICE_ID_YEARLY).toBe("price_yearly_dummy");
    expect(PRICE_ID).toBe(PRICE_ID_MONTHLY);
  });
});
