import { describe, expect, it } from "vitest";
import { billedDate, paidDate } from "@/lib/billingDates";
import { buildBillingReport } from "@/lib/billing";
import { buildMonthlyBillingBuckets } from "@/lib/monthlyBilling";

describe("billedDate / paidDate", () => {
  it("billedDate prefers date_submitted, falls back to created_at (period_end is not part of this chain)", () => {
    expect(billedDate({ date_submitted: "2026-06-01", created_at: "2026-07-01T00:00:00Z" })).toBe(
      "2026-06-01"
    );
    expect(billedDate({ date_submitted: null, created_at: "2026-07-01T00:00:00Z" })).toBe(
      "2026-07-01T00:00:00Z"
    );
  });

  it("paidDate prefers date_paid, falls back to the resolved billed date", () => {
    expect(
      paidDate({ date_paid: "2026-08-01", date_submitted: "2026-06-01", created_at: "2026-06-01T00:00:00Z" })
    ).toBe("2026-08-01");
    expect(
      paidDate({ date_paid: null, date_submitted: "2026-06-01", created_at: "2026-06-01T00:00:00Z" })
    ).toBe("2026-06-01");
    expect(
      paidDate({ date_paid: null, date_submitted: null, created_at: "2026-06-01T00:00:00Z" })
    ).toBe("2026-06-01T00:00:00Z");
  });
});

describe("monthly chart and quarterly/annual report agree on which period a draw lands in", () => {
  it("a draw with period_end in December but created_at in January, and no submission/payment dates, lands in January in both", () => {
    const draw = {
      project_id: "p1",
      status: "approved" as const,
      amount_requested: 40000,
      amount_paid: 0,
      date_submitted: null,
      date_approved: null,
      date_paid: null,
      created_at: "2026-01-03T00:00:00Z",
      period_end: "2025-12-20",
      excluded_allocated: 0,
    };

    const monthly = buildMonthlyBillingBuckets([draw]);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].key).toBe("2026-01");
    expect(monthly[0].invoiced).toBe(40000);

    const annual2025 = buildBillingReport([draw], 2025);
    expect(annual2025.ytdRequested).toBe(0);

    const annual2026 = buildBillingReport([draw], 2026);
    expect(annual2026.ytdRequested).toBe(40000);
  });
});
