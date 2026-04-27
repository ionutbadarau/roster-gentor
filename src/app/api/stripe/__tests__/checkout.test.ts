import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionsCreate = vi.fn();
const getUser = vi.fn();
const supabaseSelectSingle = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: sessionsCreate } },
  },
  resolvePriceId: (interval: "monthly" | "yearly") =>
    interval === "yearly" ? "price_yearly" : "price_monthly",
}));

vi.mock("../../../../../supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock("../../../../../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: supabaseSelectSingle }),
      }),
    }),
  },
}));

beforeEach(() => {
  sessionsCreate.mockReset();
  getUser.mockReset();
  supabaseSelectSingle.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

function makeReq(body?: unknown): Request {
  return new Request("https://example.test/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout", () => {
  it("returns 401 when user not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("../checkout/route");
    const res = await POST(makeReq({ plan: "monthly" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when no subscription record exists", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    supabaseSelectSingle.mockResolvedValue({ data: null });
    const { POST } = await import("../checkout/route");
    const res = await POST(makeReq({ plan: "monthly" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No subscription record found");
  });

  it("uses the monthly price by default when no body sent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    supabaseSelectSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_1" },
    });
    sessionsCreate.mockResolvedValue({ url: "https://stripe.test/session" });
    const { POST } = await import("../checkout/route");

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_monthly");
    expect(args.mode).toBe("subscription");
    expect(args.customer).toBe("cus_1");
    expect(args.metadata.user_id).toBe("user-1");
  });

  it("uses the yearly price when plan='yearly'", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    supabaseSelectSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_2" },
    });
    sessionsCreate.mockResolvedValue({ url: "https://stripe.test/yearly" });
    const { POST } = await import("../checkout/route");

    const res = await POST(makeReq({ plan: "yearly" }));
    expect(res.status).toBe(200);
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_yearly");
  });

  it("falls back to monthly for unknown plan values", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-3" } } });
    supabaseSelectSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_3" },
    });
    sessionsCreate.mockResolvedValue({ url: "https://stripe.test/x" });
    const { POST } = await import("../checkout/route");

    const res = await POST(makeReq({ plan: "weekly" }));
    expect(res.status).toBe(200);
    expect(sessionsCreate.mock.calls[0][0].line_items[0].price).toBe(
      "price_monthly",
    );
  });
});
