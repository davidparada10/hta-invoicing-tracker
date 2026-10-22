import { describe, expect, it } from "vitest";
import { dataReviewItems } from "@/lib/dataReview";
import type { BudgetLine, OwnerDraw, Project } from "@/lib/types";

const project = (o: Partial<Project> = {}): Project => ({
  id: "p1", name: "Alpha", project_number: "1", address: null, lender: "Bank", developer: "Dev",
  status: "active", created_at: "", draw_due_type: "day_of_month", draw_due_day: 30, draw_skip_month: null, ...o,
});
const draw = (o: Partial<OwnerDraw> = {}): OwnerDraw => ({
  id: "d1", project_id: "p1", draw_number: 1, period_start: null, period_end: "2026-05-31",
  amount_requested: 100, amount_approved: 100, retainage_held: 0, amount_paid: 100,
  date_submitted: "2026-05-31", date_approved: null, date_paid: "2026-06-15", status: "paid",
  notes: null, created_at: "", deleted_at: null, ...o,
});
const line = (o: Partial<BudgetLine> = {}): BudgetLine => ({
  id: "l1", project_id: "p1", item_number: null, category: null, description: "Hardscape",
  scheduled_value: 1000, sort_order: 0, retention_exempt: false, retention_rate_override: null,
  excluded_from_contract: false, created_at: "", deleted_at: null, ...o,
});
const run = (i: Partial<Parameters<typeof dataReviewItems>[0]>) =>
  dataReviewItems({ projects: [project()], draws: [], budgetLines: [], allocations: [], ...i });

describe("dataReviewItems", () => {
  it("is empty for clean data", () => {
    expect(run({ draws: [draw()] })).toEqual([]);
  });
  it("flags a missing draw schedule on active projects only (a blank lender is not flagged)", () => {
    const kinds = run({
      projects: [project({ lender: null, draw_due_type: null }), project({ id: "p2", status: "closed", draw_due_type: null })],
    }).map((i) => i.kind);
    expect(kinds).toEqual(["missing_cadence"]);
  });
  it("does not flag a project deliberately set to no regular schedule", () => {
    expect(run({ projects: [project({ draw_due_type: null, draw_schedule_waived: true })] })).toEqual([]);
    expect(run({ projects: [project({ draw_due_type: null, draw_schedule_waived: false })] })).toHaveLength(1);
  });
  it("flags date problems on non-draft live draws only", () => {
    const items = run({
      draws: [
        draw({ id: "a", draw_number: 1, date_submitted: null }),
        draw({ id: "b", draw_number: 2, date_submitted: "2026-06-10", date_paid: "2026-06-01", period_end: "2026-06-10" }),
        draw({ id: "c", draw_number: 3, date_submitted: "2026-01-01", date_paid: "2026-09-01", period_end: "2026-01-01" }),
        // Submitted well before its period ends is normal and not flagged.
        draw({ id: "d", draw_number: 4, date_submitted: "2026-03-31", period_end: "2026-05-15", date_paid: "2026-05-22" }),
        draw({ id: "e", draw_number: 5, status: "draft", date_submitted: null }),
        draw({ id: "f", draw_number: 6, date_submitted: null, deleted_at: "2026-01-01" }),
      ],
    });
    expect(items.map((i) => [i.kind, i.subject])).toEqual([
      ["missing_submitted", "Draw #1"],
      ["paid_before_submitted", "Draw #2"],
      ["slow_payment", "Draw #3"],
    ]);
  });
  it("flags lines billed past scheduled value, ignoring drafts", () => {
    const items = run({
      draws: [draw({ id: "a" }), draw({ id: "b", draw_number: 2, status: "draft" })],
      budgetLines: [line()],
      allocations: [
        { draw_id: "a", budget_line_id: "l1", amount: 1500 },
        { draw_id: "b", budget_line_id: "l1", amount: 9999 },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "over_budget_line", detail: "$500.00 over its scheduled value" });
  });
});
