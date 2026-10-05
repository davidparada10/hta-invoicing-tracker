import { describe, expect, it } from "vitest";
import {
  buildBillingReport,
  buildLabelBillingBreakdown,
  buildProjectBillingBreakdown,
  buildShortPaymentSummary,
  DrawForBilling,
} from "@/lib/billing";

function project(overrides: { id: string; draw_due_type?: "day_of_month" | "last_weekday" | null; draw_due_day?: number | null; name?: string; label?: string | null }) {
  return {
    id: overrides.id,
    draw_due_type: overrides.draw_due_type ?? null,
    draw_due_day: overrides.draw_due_day ?? null,
    name: overrides.name ?? "Test Project",
    label: overrides.label ?? null,
  };
}

function draw(overrides: Partial<DrawForBilling> = {}): DrawForBilling {
  return {
    project_id: "proj-1",
    status: "paid",
    amount_requested: 100000,
    amount_paid: 100000,
    date_submitted: "2026-06-01",
    date_approved: "2026-06-05",
    date_paid: "2026-06-10",
    created_at: "2026-06-01T00:00:00Z",
    excluded_allocated: 0,
    ...overrides,
  };
}

describe("buildBillingReport — cross-year billing and receipts", () => {
  it("a draw billed in December but paid in January of the next year lands billed in the earlier year and received in the later one, not the same one", () => {
    const d = draw({
      date_submitted: "2025-12-20",
      date_paid: "2026-01-05",
      amount_requested: 50000,
      amount_paid: 50000,
      created_at: "2025-12-20T00:00:00Z",
    });

    const report2025 = buildBillingReport([d], 2025);
    expect(report2025.ytdRequested).toBe(50000);
    expect(report2025.ytdReceived).toBe(0);

    const report2026 = buildBillingReport([d], 2026);
    expect(report2026.ytdRequested).toBe(0);
    expect(report2026.ytdReceived).toBe(50000);
  });

  it("excludes drafts from billed and received entirely", () => {
    const d = draw({ status: "draft", amount_requested: 999999, amount_paid: 0 });
    const report = buildBillingReport([d], 2026);
    expect(report.ytdRequested).toBe(0);
    expect(report.ytdReceived).toBe(0);
  });

  it("nets owner-paid (excluded_allocated) scope out of billed", () => {
    const d = draw({ amount_requested: 100000, excluded_allocated: 20000, amount_paid: 0 });
    const report = buildBillingReport([d], 2026);
    expect(report.ytdRequested).toBe(80000);
  });

  it("a draw marked paid without a recorded date_paid falls back to its submission date rather than being dropped", () => {
    const d = draw({
      date_submitted: "2026-03-01",
      date_paid: null,
      amount_requested: 40000,
      amount_paid: 40000,
    });
    const report = buildBillingReport([d], 2026);
    expect(report.ytdReceived).toBe(40000);
    expect(report.quarters[0].received).toBe(40000); // Q1
  });
});

describe("buildProjectBillingBreakdown — same rules, rolled up per project", () => {
  it("excludes drafts and nets owner-paid scope per project too", () => {
    const rows = buildProjectBillingBreakdown(
      [
        draw({ project_id: "p1", status: "draft", amount_requested: 999999 }),
        draw({ project_id: "p1", amount_requested: 100000, excluded_allocated: 30000, amount_paid: 0 }),
      ],
      [project({ id: "p1" })],
      2026
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].requested).toBe(70000);
  });

  it("counts a draw submitted on or before its project's due date as on time, and after it as late", () => {
    const dueThe25th = project({ id: "p1", draw_due_type: "day_of_month", draw_due_day: 25 });
    const rows = buildProjectBillingBreakdown(
      [
        draw({ project_id: "p1", date_submitted: "2026-06-20" }), // before the 25th
        draw({ project_id: "p1", date_submitted: "2026-07-28" }), // after the 25th
      ],
      [dueThe25th],
      2026
    );
    expect(rows[0].onTimeCount).toBe(1);
    expect(rows[0].lateCount).toBe(1);
  });

  it("doesn't count a draft's submission date, and doesn't count anything for a project with no cadence", () => {
    const noCadence = project({ id: "p1" });
    const rows = buildProjectBillingBreakdown(
      [
        draw({ project_id: "p1", status: "draft", date_submitted: "2026-06-01" }),
        draw({ project_id: "p1", date_submitted: "2026-06-01" }),
      ],
      [noCadence],
      2026
    );
    expect(rows[0].onTimeCount).toBe(0);
    expect(rows[0].lateCount).toBe(0);
  });
});

describe("buildLabelBillingBreakdown — grouped by an arbitrary label (developer/lender)", () => {
  it("rolls up multiple projects under the same label", () => {
    const rows = buildLabelBillingBreakdown(
      [
        draw({ project_id: "p1", amount_requested: 100000, amount_paid: 0 }),
        draw({ project_id: "p2", amount_requested: 50000, amount_paid: 0 }),
      ],
      [project({ id: "p1", label: "HVN" }), project({ id: "p2", label: "HVN" })],
      2026,
      "Unassigned"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].groupName).toBe("HVN");
    expect(rows[0].requested).toBe(150000);
  });

  it("buckets projects with no label under the unassigned label, sorted last", () => {
    const rows = buildLabelBillingBreakdown(
      [
        draw({ project_id: "p1", amount_requested: 10000, amount_paid: 0 }),
        draw({ project_id: "p2", amount_requested: 999999, amount_paid: 0 }),
      ],
      [project({ id: "p1", label: "HVN" }), project({ id: "p2", label: null })],
      2026,
      "Unassigned"
    );
    expect(rows[rows.length - 1].groupName).toBe("Unassigned");
  });
});

describe("buildShortPaymentSummary", () => {
  it("flags a paid draw whose amount_paid doesn't match amount_approved", () => {
    const d = draw({
      status: "paid",
      amount_approved: 100000,
      amount_paid: 95000,
      date_paid: "2026-06-10",
    });
    const summary = buildShortPaymentSummary([d], 2026);
    expect(summary.count).toBe(1);
    expect(summary.totalGap).toBe(5000);
  });

  it("ignores a normal fully-paid draw", () => {
    const d = draw({ status: "paid", amount_approved: 100000, amount_paid: 100000, date_paid: "2026-06-10" });
    const summary = buildShortPaymentSummary([d], 2026);
    expect(summary.count).toBe(0);
    expect(summary.totalGap).toBe(0);
  });

  it("scopes by the year the draw was actually paid", () => {
    const d = draw({
      status: "paid",
      amount_approved: 100000,
      amount_paid: 90000,
      date_paid: "2025-12-15",
    });
    expect(buildShortPaymentSummary([d], 2026).count).toBe(0);
    expect(buildShortPaymentSummary([d], 2025).count).toBe(1);
  });

  it("ignores draws that were never actually paid", () => {
    const d = draw({ status: "submitted", amount_approved: 100000, amount_paid: 0, date_paid: null });
    expect(buildShortPaymentSummary([d], 2026).count).toBe(0);
  });
});

// ---- Per-receipt reporting (payment history) ----------------------------------

import type { DrawPayment } from "@/lib/paymentHistory";

function receipt(id: string, drawId: string, amount: number, date: string, overrides: Partial<DrawPayment> = {}): DrawPayment {
  return {
    id,
    draw_id: drawId,
    amount,
    date_received: date,
    source: "manual",
    idempotency_key: null,
    created_at: `${date}T00:00:00Z`,
    deleted_at: null,
    ...overrides,
  };
}

describe("receipts: $30,000 in September + $20,000 in October on one draw", () => {
  // The brief's regression example. The draw's cached columns are what the DB
  // function leaves behind: total $50,000, date_paid = the latest receipt.
  const split = draw({
    id: "split",
    amount_requested: 50000,
    amount_paid: 50000,
    date_submitted: "2026-08-25",
    date_paid: "2026-10-05",
    status: "paid",
  });
  const receipts = [receipt("a", "split", 30000, "2026-09-20"), receipt("b", "split", 20000, "2026-10-05")];

  it("quarterly: both receipts land in Q3 and Q4 separately instead of $50k in Q4", () => {
    const q = buildBillingReport([split], 2026, receipts).quarters;
    expect(q[2].received).toBe(30000); // Q3 (Sept)
    expect(q[3].received).toBe(20000); // Q4 (Oct)
  });

  it("annual: the year's received is the full $50,000", () => {
    expect(buildBillingReport([split], 2026, receipts).ytdReceived).toBe(50000);
  });

  it("without receipt rows the same draw still reports its whole total on date_paid (unchanged behavior)", () => {
    const q = buildBillingReport([split], 2026).quarters;
    expect(q[3].received).toBe(50000);
    expect(q[2].received).toBe(0);
  });

  it("by project: received is the sum of its receipts in the year", () => {
    const rows = buildProjectBillingBreakdown([split], [project({ id: "proj-1" })], 2026, receipts);
    expect(rows[0].received).toBe(50000);
  });

  it("a receipt dated in a different year is counted in that year only", () => {
    const dec = [receipt("a", "split", 30000, "2025-12-28"), receipt("b", "split", 20000, "2026-01-04")];
    expect(buildBillingReport([split], 2025, dec).ytdReceived).toBe(30000);
    expect(buildBillingReport([split], 2026, dec).ytdReceived).toBe(20000);
  });

  it("days to pay measures to the LAST receipt, not the first", () => {
    // submitted Aug 25 → last receipt Oct 5 = 41 days (the first would be 26).
    expect(buildBillingReport([split], 2026, receipts).ytdAvgDaysToPay).toBe(41);
  });

  it("a voided receipt is ignored", () => {
    const withVoid = [...receipts, receipt("c", "split", 9999, "2026-07-01", { deleted_at: "2026-07-02T00:00:00Z" })];
    expect(buildBillingReport([split], 2026, withVoid).ytdReceived).toBe(50000);
  });

  it("short-pay summary compares approved against the receipts' total, in the year of the last receipt", () => {
    const short = draw({ ...split, amount_approved: 52000 });
    expect(buildShortPaymentSummary([short], 2026, receipts)).toEqual({ count: 1, totalGap: 2000 });
  });
});

describe("receipts: draws without receipt rows keep reporting from their cached totals", () => {
  it("a legacy draw alongside a receipt-backed draw both count", () => {
    const legacy = draw({ id: "legacy", amount_paid: 7000, amount_requested: 7000, date_paid: "2026-02-01", date_submitted: "2026-01-15" });
    const backed = draw({ id: "backed", amount_paid: 3000, amount_requested: 3000, date_paid: "2026-05-01" });
    const rows = [receipt("r", "backed", 3000, "2026-05-01")];
    const report = buildBillingReport([legacy, backed], 2026, rows);
    expect(report.quarters[0].received).toBe(7000);
    expect(report.quarters[1].received).toBe(3000);
  });
});

// ---- Average days to pay = completed settlement --------------------------------

describe("average days to pay measures settlement, not the latest receipt", () => {
  const base = {
    id: "s",
    status: "paid",
    amount_requested: 100000,
    amount_paid: 100000,
    date_submitted: "2026-09-01",
    date_paid: "2026-10-05",
  };
  const days = (d: DrawForBilling, rows: DrawPayment[] = []) => buildBillingReport([d], 2026, rows);

  it("brief example: $30k on Sep 10 is excluded; the $70k on Oct 5 settles it at 34 days, in Q4", () => {
    const part = [receipt("a", "s", 30000, "2026-09-10")];
    const partDraw = draw({ ...base, amount_paid: 30000, date_paid: "2026-09-10" });
    expect(days(partDraw, part).ytdAvgDaysToPay).toBeNull();

    const rows = [...part, receipt("b", "s", 70000, "2026-10-05")];
    const r = days(draw(base), rows);
    expect(r.ytdAvgDaysToPay).toBe(34);
    expect(r.quarters[3].avgDaysToPay).toBe(34); // attributed to Oct / Q4
    expect(r.quarters[2].avgDaysToPay).toBeNull();
  });

  it("a draw marked paid that still has a collectible balance is excluded", () => {
    const d = draw({ ...base, amount_paid: 60000 });
    expect(days(d, [receipt("a", "s", 60000, "2026-09-10")]).ytdAvgDaysToPay).toBeNull();
  });

  it("a later excess payment does not push the settlement date out", () => {
    const rows = [receipt("a", "s", 100000, "2026-09-20"), receipt("b", "s", 500, "2026-11-30")];
    expect(days(draw({ ...base, amount_paid: 100500 }), rows).ytdAvgDaysToPay).toBe(19);
  });

  it("an overpayment in one receipt settles on that receipt's date", () => {
    expect(days(draw({ ...base, amount_paid: 120000 }), [receipt("a", "s", 120000, "2026-09-12")]).ytdAvgDaysToPay).toBe(11);
  });

  it("owner-paid scope lowers what must be collected", () => {
    const d = draw({ ...base, amount_paid: 80000, excluded_allocated: 20000 });
    expect(days(d, [receipt("a", "s", 80000, "2026-09-11")]).ytdAvgDaysToPay).toBe(10);
  });

  it("fully owner-funded scope with no receipt is not 'paid'", () => {
    const d = draw({ ...base, amount_paid: 0, excluded_allocated: 100000 });
    expect(days(d, []).ytdAvgDaysToPay).toBeNull();
  });

  it("uses cents, not the $1,000 display threshold: a $50 shortfall is not settled", () => {
    const short = draw({ ...base, amount_paid: 99950 });
    expect(days(short, [receipt("a", "s", 99950, "2026-09-10")]).ytdAvgDaysToPay).toBeNull();
    const exact = draw({ ...base, amount_paid: 100000 });
    expect(days(exact, [receipt("a", "s", 99999.995, "2026-09-10")]).ytdAvgDaysToPay).toBe(9);
  });

  it("excludes drafts", () => {
    expect(days(draw({ ...base, status: "draft" }), [receipt("a", "s", 100000, "2026-09-10")]).ytdAvgDaysToPay).toBeNull();
  });

  it("a void recomputes settlement from the live receipts", () => {
    const rows = [
      receipt("a", "s", 100000, "2026-09-10", { deleted_at: "2026-09-11T00:00:00Z" }),
      receipt("b", "s", 100000, "2026-10-01"),
    ];
    expect(days(draw({ ...base, amount_paid: 100000 }), rows).ytdAvgDaysToPay).toBe(30);
    // Voiding the only covering receipt leaves it unsettled.
    expect(days(draw({ ...base, amount_paid: 0 }), [rows[0]]).ytdAvgDaysToPay).toBeNull();
  });

  it("a correction (void + replacement) moves the settlement date", () => {
    const rows = [
      receipt("old", "s", 100000, "2026-09-10", { deleted_at: "2026-10-02T00:00:00Z" }),
      receipt("new", "s", 100000, "2026-09-25"),
    ];
    expect(days(draw({ ...base }), rows).ytdAvgDaysToPay).toBe(24);
  });

  it("cross-quarter: the days count to settlement and land in the settling quarter", () => {
    const rows = [receipt("a", "s", 50000, "2026-06-20"), receipt("b", "s", 50000, "2026-07-15")];
    const r = days(draw({ ...base, date_submitted: "2026-06-01" }), rows);
    expect(r.quarters[2].avgDaysToPay).toBe(44);
    expect(r.quarters[1].avgDaysToPay).toBeNull();
  });

  it("the same rule applies per project and per label", () => {
    const rows = [receipt("a", "s", 30000, "2026-09-10")];
    const partial = draw({ ...base, amount_paid: 30000 });
    expect(buildProjectBillingBreakdown([partial], [project({ id: "proj-1" })], 2026, rows)[0].avgDaysToPay).toBeNull();
    const done = [...rows, receipt("b", "s", 70000, "2026-10-05")];
    expect(buildProjectBillingBreakdown([draw(base)], [project({ id: "proj-1" })], 2026, done)[0].avgDaysToPay).toBe(34);
    expect(buildLabelBillingBreakdown([draw(base)], [{ ...project({ id: "proj-1" }), label: "L" }], 2026, "—", done)[0].avgDaysToPay).toBe(34);
  });

  it("legacy draw with no receipt rows settles on its real date_paid", () => {
    const legacy = draw({ ...base, id: "legacy", date_paid: "2026-09-12" });
    expect(days(legacy).ytdAvgDaysToPay).toBe(11);
  });

  it("legacy draw with an inferred date (no date_paid) is excluded rather than read as 0 days", () => {
    const legacy = draw({ ...base, id: "legacy", date_paid: null });
    expect(days(legacy).ytdAvgDaysToPay).toBeNull();
    const inferredRow = [receipt("a", "legacy", 100000, "2026-09-01", { date_inferred: true })];
    expect(days(draw({ ...base, id: "legacy" }), inferredRow).ytdAvgDaysToPay).toBeNull();
  });
});
