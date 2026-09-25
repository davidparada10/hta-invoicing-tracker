import { describe, expect, it } from "vitest";
import { buildMonthlyBillingBuckets, monthKey, monthLabel } from "@/lib/monthlyBilling";

function draw(overrides: Record<string, unknown> = {}) {
  return {
    status: "approved" as const,
    amount_requested: 100000,
    amount_paid: 0,
    excluded_allocated: 0,
    date_submitted: "2026-06-01",
    date_paid: null,
    period_end: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildMonthlyBillingBuckets", () => {
  it("excludes drafts entirely", () => {
    const buckets = buildMonthlyBillingBuckets([draw({ status: "draft", amount_requested: 999999 })]);
    expect(buckets).toHaveLength(0);
  });

  it("nets owner-paid scope out of the invoiced amount", () => {
    const buckets = buildMonthlyBillingBuckets([draw({ amount_requested: 100000, excluded_allocated: 30000 })]);
    expect(buckets[0].invoiced).toBe(70000);
  });

  it("groups invoiced by submission date and paid by payment date, landing in different months when they differ", () => {
    const d = draw({
      date_submitted: "2026-08-20",
      date_paid: "2026-09-05",
      amount_requested: 50000,
      amount_paid: 50000,
    });
    const buckets = buildMonthlyBillingBuckets([d]);
    const aug = buckets.find((b) => b.key === "2026-08");
    const sep = buckets.find((b) => b.key === "2026-09");
    expect(aug?.invoiced).toBe(50000);
    expect(aug?.paid ?? 0).toBe(0);
    expect(sep?.paid).toBe(50000);
    expect(sep?.invoiced ?? 0).toBe(0);
  });

  it("falls back to period_end then created_at when date_submitted is missing", () => {
    const d = draw({ date_submitted: null, period_end: "2026-05-15", amount_requested: 20000 });
    const buckets = buildMonthlyBillingBuckets([d]);
    expect(buckets[0].key).toBe("2026-05");
  });

  it("sums multiple draws landing in the same month", () => {
    const buckets = buildMonthlyBillingBuckets([
      draw({ date_submitted: "2026-06-01", amount_requested: 10000 }),
      draw({ date_submitted: "2026-06-15", amount_requested: 5000 }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].invoiced).toBe(15000);
  });
});

describe("monthKey / monthLabel", () => {
  it("extracts YYYY-MM and renders a short label", () => {
    const key = monthKey("2026-03-14");
    expect(key).toBe("2026-03");
    expect(monthLabel(key)).toBe("Mar 26");
  });
});
