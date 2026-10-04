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

  it("falls back to created_at (not period_end) when date_submitted is missing — matches lib/billing.ts", () => {
    const d = draw({
      date_submitted: null,
      period_end: "2025-12-20", // deliberately a different month than created_at
      created_at: "2026-01-03T00:00:00Z",
      amount_requested: 20000,
    });
    const buckets = buildMonthlyBillingBuckets([d]);
    expect(buckets[0].key).toBe("2026-01");
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

describe("buildMonthlyBillingBuckets — per-receipt paid amounts", () => {
  const split = draw({
    id: "split",
    status: "paid" as const,
    amount_requested: 50000,
    amount_paid: 50000,
    date_submitted: "2026-08-25",
    date_paid: "2026-10-05",
  });
  const rows = [
    { id: "a", draw_id: "split", amount: 30000, date_received: "2026-09-20", source: "manual" as const, idempotency_key: null, created_at: "2026-09-20T00:00:00Z", deleted_at: null },
    { id: "b", draw_id: "split", amount: 20000, date_received: "2026-10-05", source: "manual" as const, idempotency_key: null, created_at: "2026-10-05T00:00:00Z", deleted_at: null },
  ];

  // The brief's regression example, in the chart.
  it("charts $30,000 in September and $20,000 in October, not $50,000 in October", () => {
    const buckets = buildMonthlyBillingBuckets([split], rows);
    expect(buckets.find((b) => b.key === "2026-09")?.paid).toBe(30000);
    expect(buckets.find((b) => b.key === "2026-10")?.paid).toBe(20000);
  });

  it("without receipt rows, charts the whole cached total on date_paid exactly as before", () => {
    const buckets = buildMonthlyBillingBuckets([split]);
    expect(buckets.find((b) => b.key === "2026-10")?.paid).toBe(50000);
    expect(buckets.find((b) => b.key === "2026-09")?.paid ?? 0).toBe(0);
  });

  it("ignores voided receipts", () => {
    const withVoid = [...rows, { ...rows[0], id: "c", amount: 777, deleted_at: "2026-09-21T00:00:00Z" }];
    expect(buildMonthlyBillingBuckets([split], withVoid).find((b) => b.key === "2026-09")?.paid).toBe(30000);
  });
});
