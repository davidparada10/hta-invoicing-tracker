import { describe, expect, it } from "vitest";
import { buildBillingReport, buildProjectBillingBreakdown, DrawForBilling } from "@/lib/billing";

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
      [{ id: "p1", name: "Test Project" }],
      2026
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].requested).toBe(70000);
  });
});
