import { describe, it, expect, beforeEach, vi } from "vitest";

const constructEvent = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();

// Chainable Supabase: from().update().eq() resolves; we want to capture both
// the update payload and the eq filter.
function resetSupabaseChain() {
  updateMock.mockReset();
  eqMock.mockReset();
  eqMock.mockResolvedValue({ data: null, error: null });
  updateMock.mockReturnValue({ eq: eqMock });
}

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent },
  },
}));

vi.mock("../../../../../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({ update: updateMock }),
  },
}));

beforeEach(() => {
  constructEvent.mockReset();
  resetSupabaseChain();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

function makeReq(body: string, sig: string | null = "sig_test"): Request {
  const headers: Record<string, string> = {};
  if (sig) headers["stripe-signature"] = sig;
  return new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  it("rejects requests with no signature header (400)", async () => {
    const { POST } = await import("../webhook/route");
    const res = await POST(makeReq("{}", null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No signature");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects requests when signature verification fails (400)", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const { POST } = await import("../webhook/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid signature");
    expect(updateMock).not.toHaveBeenCalled();
  });

  describe("checkout.session.completed", () => {
    it("activates the subscription for the matching customer", async () => {
      constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "subscription",
            subscription: "sub_123",
            customer: "cus_abc",
          },
        },
      });
      const { POST } = await import("../webhook/route");
      const res = await POST(makeReq("{}"));
      expect(res.status).toBe(200);
      const payload = updateMock.mock.calls[0][0];
      expect(payload.stripe_subscription_id).toBe("sub_123");
      expect(payload.status).toBe("active");
      expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_abc");
    });

    it("ignores sessions that aren't subscription mode", async () => {
      constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: { mode: "payment", customer: "cus_x" },
        },
      });
      const { POST } = await import("../webhook/route");
      const res = await POST(makeReq("{}"));
      expect(res.status).toBe(200);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("handles subscription as expanded object (not just an ID string)", async () => {
      constructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "subscription",
            subscription: { id: "sub_obj_1" },
            customer: "cus_y",
          },
        },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock.mock.calls[0][0].stripe_subscription_id).toBe(
        "sub_obj_1",
      );
    });
  });

  describe("customer.subscription.updated", () => {
    it("syncs status, period bounds, and cancel flag", async () => {
      const start = 1_700_000_000;
      const end = 1_702_592_000;
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            customer: "cus_upd",
            status: "active",
            cancel_at_period_end: true,
            items: {
              data: [
                {
                  current_period_start: start,
                  current_period_end: end,
                },
              ],
            },
          },
        },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      const payload = updateMock.mock.calls[0][0];
      expect(payload.status).toBe("active");
      expect(payload.cancel_at_period_end).toBe(true);
      expect(payload.current_period_start).toBe(
        new Date(start * 1000).toISOString(),
      );
      expect(payload.current_period_end).toBe(
        new Date(end * 1000).toISOString(),
      );
      expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_upd");
    });

    it("tolerates missing items.data (period dates become null)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            customer: "cus_no_items",
            status: "trialing",
            cancel_at_period_end: false,
            items: { data: [] },
          },
        },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      const payload = updateMock.mock.calls[0][0];
      expect(payload.current_period_start).toBeNull();
      expect(payload.current_period_end).toBeNull();
    });
  });

  describe("customer.subscription.deleted", () => {
    it("marks the subscription as canceled", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_del" } },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock.mock.calls[0][0].status).toBe("canceled");
      expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_del");
    });
  });

  describe("invoice.payment_succeeded", () => {
    it("activates subscription when invoice has a subscription", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: { subscription: "sub_paid", customer: "cus_paid" },
        },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock.mock.calls[0][0].status).toBe("active");
      expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_paid");
    });

    it("does nothing for one-off invoices without a subscription", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: { object: { customer: "cus_oneoff" } },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe("invoice.payment_failed", () => {
    it("marks the subscription past_due", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: { subscription: "sub_fail", customer: "cus_fail" },
        },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock.mock.calls[0][0].status).toBe("past_due");
      expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_fail");
    });

    it("ignores invoices that aren't tied to a subscription", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_x" } },
      });
      const { POST } = await import("../webhook/route");
      await POST(makeReq("{}"));
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  it("returns 200 for unhandled event types without touching the DB", async () => {
    constructEvent.mockReturnValue({
      type: "customer.created",
      data: { object: { id: "cus_new" } },
    });
    const { POST } = await import("../webhook/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
