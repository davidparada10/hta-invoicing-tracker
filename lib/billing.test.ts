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
