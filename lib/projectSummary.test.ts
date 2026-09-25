import { describe, expect, it } from "vitest";
import { computeProjectSummary } from "@/lib/projectSummary";
import { OwnerDraw } from "@/lib/types";

function draw(overrides: Partial<OwnerDraw> = {}): OwnerDraw {
  return {
    id: "d1",
    project_id: "p1",
    draw_number: 1,
    period_start: null,
    period_end: null,
    amount_requested: 100000,
    amount_approved: 100000,
    retainage_held: 5000,
    amount_paid: 0,
    date_submitted: "2026-01-01",
    date_approved: null,
    date_paid: null,
    status: "approved",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    excluded_allocated: 0,
    ...overrides,
  };
}

describe("computeProjectSummary — draft exclusion from progress and posted retainage", () => {
  it("excludes a draft's amount_requested and retainage from every total", () => {
    const live = draw({ id: "live", amount_requested: 100000, amount_paid: 50000, retainage_held: 5000 });
    const inProgress = draw({
      id: "draft",
      status: "draft",
      amount_requested: 999999,
      amount_paid: 0,
      retainage_held: 999999,
    });
    const summary = computeProjectSummary([live, inProgress]);
    expect(summary.totalRequested).toBe(100000);
    expect(summary.retainageHeld).toBe(5000);
  });

  it("nets owner-paid scope out of requested", () => {
    const summary = computeProjectSummary([
      draw({ amount_requested: 100000, excluded_allocated: 20000, amount_paid: 0 }),
    ]);
    expect(summary.totalRequested).toBe(80000);
  });

  it("an overpayment on one draw doesn't mask an unpaid balance on another in currently-invoiced or settled %", () => {
    // Draw A: $100k billed, $150k received (overpaid by $50k).
    // Draw B: $50k billed, $0 received.
    const overpaid = draw({ id: "d1", amount_requested: 100000, amount_paid: 150000 });
    const unpaid = draw({ id: "d2", amount_requested: 50000, amount_paid: 0 });
    const summary = computeProjectSummary([overpaid, unpaid]);
    // Actual cash received stays the true total, unaffected.
    expect(summary.totalPaidToOwner).toBe(150000);
    // B's balance is still genuinely outstanding.
    expect(summary.totalOpenToOwner).toBe(50000);
    // A's overpayment can't count toward paying off B — settled % must not
    // read 100 while $50k is still owed. 100k settled (capped) of 150k
    // total billed = 66%, not 100%.
    expect(summary.paidPct).toBe(66);
  });

  it("caps the paid percentage at 100 and floors below it rather than rounding up to it", () => {
    const almostDone = computeProjectSummary([
      draw({ amount_requested: 100000, amount_paid: 99999 }),
    ]);
    expect(almostDone.paidPct).toBe(99);

    const overpaid = computeProjectSummary([
      draw({ amount_requested: 100000, amount_paid: 150000 }),
    ]);
    expect(overpaid.paidPct).toBe(100);
  });
});
