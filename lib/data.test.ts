import { describe, expect, it } from "vitest";
import {
  openBalance,
  hasMeaningfulOpenBalance,
  excludedAllocationByDraw,
  contractValue,
  getLiveDraw,
  remainingBalanceForDraw,
  getExcludedAllocatedForDraw,
  MIN_MEANINGFUL_OPEN_BALANCE,
} from "@/lib/data";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { OwnerDraw, BudgetLine } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

// A minimal in-memory fake of the subset of the Supabase query builder this
// module's DB-touching helpers actually use (select/eq/is/order/range/
// maybeSingle/single) — enough to exercise getLiveDraw, remainingBalanceFor
// Draw, and getExcludedAllocatedForDraw against synthetic fixtures without a
// real database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(tables: Record<string, any[]>): SupabaseClient {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any[] = tables[table] ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        is(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return Promise.resolve({ data: rows, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          if (rows.length === 0) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "no rows returned" },
            });
          }
          return Promise.resolve({ data: rows[0], error: null });
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function draw(overrides: Partial<OwnerDraw> = {}): OwnerDraw {
  return {
    id: "draw-1",
    project_id: "proj-1",
    draw_number: 1,
    period_start: null,
    period_end: null,
    amount_requested: 100000,
    amount_approved: 100000,
    retainage_held: 0,
    amount_paid: 30000,
    date_submitted: "2026-01-01",
    date_approved: null,
    date_paid: null,
    status: "approved",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function budgetLine(overrides: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id: "line-1",
    project_id: "proj-1",
    item_number: null,
    category: null,
    description: "Scope",
    scheduled_value: 0,
    sort_order: 1,
    retention_exempt: false,
    retention_rate_override: null,
    excluded_from_contract: false,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("openBalance — the shared remaining-collectible-balance calculation", () => {
  it("nets out owner-paid scope and what's already been paid (the exact worked example: $100k requested, $20k owner-paid, $30k received -> $50k remaining)", () => {
    const d = draw({ amount_requested: 100000, excluded_allocated: 20000, amount_paid: 30000 });
    expect(openBalance(d)).toBe(50000);
  });

  it("is zero for a draft regardless of amounts on the record", () => {
    const d = draw({ status: "draft", amount_requested: 100000, amount_paid: 0 });
    expect(openBalance(d)).toBe(0);
  });

  it("floors at zero rather than going negative on an overpayment", () => {
    const d = draw({ amount_requested: 100000, excluded_allocated: 0, amount_paid: 150000 });
    expect(openBalance(d)).toBe(0);
  });

  it("an overpayment on one draw can't mask an unpaid balance on another (per-draw floor before summing)", () => {
    const overpaid = draw({ id: "d1", amount_requested: 100000, amount_paid: 150000 });
    const unpaid = draw({ id: "d2", amount_requested: 50000, amount_paid: 0 });
    const total = [overpaid, unpaid].reduce((acc, d) => acc + openBalance(d), 0);
    // A naive sum(requested) - sum(paid) would read (150000-150000-50000+0)=0 —
    // wrong, since d2's $50k is still genuinely owed regardless of d1's overpay.
    expect(total).toBe(50000);
  });

  it("undecorated draws (no excluded_allocated at all) default that portion to zero", () => {
    const d = draw({ amount_requested: 100000, amount_paid: 40000, excluded_allocated: undefined });
    expect(openBalance(d)).toBe(60000);
  });
});

describe("hasMeaningfulOpenBalance", () => {
  it("is false when every draw's own balance is noise, even if the sum clears the threshold", () => {
    const draws = Array.from({ length: 5 }, (_, i) =>
      draw({ id: `d${i}`, amount_requested: 300, amount_paid: 0 })
    );
    expect(draws.reduce((acc, d) => acc + openBalance(d), 0)).toBeGreaterThan(
      MIN_MEANINGFUL_OPEN_BALANCE
    );
    expect(hasMeaningfulOpenBalance(draws)).toBe(false);
  });

  it("is true once at least one individual draw clears the threshold", () => {
    const draws = [draw({ amount_requested: MIN_MEANINGFUL_OPEN_BALANCE + 1, amount_paid: 0 })];
    expect(hasMeaningfulOpenBalance(draws)).toBe(true);
  });
});

describe("excludedAllocationByDraw", () => {
  it("sums only allocations against excluded_from_contract lines, keyed by draw", () => {
    const lines = [
      budgetLine({ id: "hta-scope", excluded_from_contract: false }),
      budgetLine({ id: "owner-scope", excluded_from_contract: true }),
    ];
    const allocations = [
      { draw_id: "d1", budget_line_id: "hta-scope", amount: 70000 },
      { draw_id: "d1", budget_line_id: "owner-scope", amount: 20000 },
      { draw_id: "d2", budget_line_id: "owner-scope", amount: 5000 },
    ];
    const map = excludedAllocationByDraw(allocations, lines);
    expect(map.get("d1")).toBe(20000);
    expect(map.get("d2")).toBe(5000);
    expect(map.has("d3")).toBe(false);
  });
});

describe("contractValue", () => {
  it("excludes owner-paid (excluded_from_contract) lines from the total", () => {
    const lines = [
      budgetLine({ scheduled_value: 500000, excluded_from_contract: false }),
      budgetLine({ scheduled_value: 100000, excluded_from_contract: true }),
    ];
    expect(contractValue(lines)).toBe(500000);
  });
});

describe("getLiveDraw", () => {
  it("finds a live draw by id", async () => {
    const supabase = fakeSupabase({ inv_owner_draws: [draw({ id: "d1" })] });
    const found = await getLiveDraw(supabase, { id: "d1" });
    expect(found?.id).toBe("d1");
  });

  it("excludes a soft-deleted draw from a lookup by id", async () => {
    const supabase = fakeSupabase({
      inv_owner_draws: [draw({ id: "d1", deleted_at: "2026-01-02T00:00:00Z" })],
    });
    const found = await getLiveDraw(supabase, { id: "d1" });
    expect(found).toBeNull();
  });

  it("finds a live draw by project + draw number", async () => {
    const supabase = fakeSupabase({
      inv_owner_draws: [draw({ id: "d1", project_id: "proj-1", draw_number: 3 })],
    });
    const found = await getLiveDraw(supabase, { projectId: "proj-1", drawNumber: 3 });
    expect(found?.id).toBe("d1");
  });

  it("does not match a draw number belonging to a different project", async () => {
    const supabase = fakeSupabase({
      inv_owner_draws: [draw({ id: "d1", project_id: "proj-OTHER", draw_number: 3 })],
    });
    const found = await getLiveDraw(supabase, { projectId: "proj-1", drawNumber: 3 });
    expect(found).toBeNull();
  });

  it("excludes a soft-deleted draw from a project + draw number lookup", async () => {
    const supabase = fakeSupabase({
      inv_owner_draws: [
        draw({ id: "d1", project_id: "proj-1", draw_number: 3, deleted_at: "2026-01-02T00:00:00Z" }),
      ],
    });
    const found = await getLiveDraw(supabase, { projectId: "proj-1", drawNumber: 3 });
    expect(found).toBeNull();
  });
});

describe("getExcludedAllocatedForDraw / remainingBalanceForDraw", () => {
  it("resolves a single draw's excluded_allocated from live budget lines + its own allocations", async () => {
    const supabase = fakeSupabase({
      inv_project_budget_lines: [
        budgetLine({ id: "hta-scope", project_id: "proj-1", excluded_from_contract: false }),
        budgetLine({ id: "owner-scope", project_id: "proj-1", excluded_from_contract: true }),
      ],
      inv_draw_line_allocations: [
        { draw_id: "d1", budget_line_id: "hta-scope", amount: 80000 },
        { draw_id: "d1", budget_line_id: "owner-scope", amount: 20000 },
      ],
    });
    const excluded = await getExcludedAllocatedForDraw(supabase, "d1", "proj-1");
    expect(excluded).toBe(20000);
  });

  it("computes the same $100k/$20k/$30k -> $50k remaining example end to end", async () => {
    const supabase = fakeSupabase({
      inv_project_budget_lines: [
        budgetLine({ id: "hta-scope", project_id: "proj-1", excluded_from_contract: false }),
        budgetLine({ id: "owner-scope", project_id: "proj-1", excluded_from_contract: true }),
      ],
      inv_draw_line_allocations: [
        { draw_id: "d1", budget_line_id: "hta-scope", amount: 80000 },
        { draw_id: "d1", budget_line_id: "owner-scope", amount: 20000 },
      ],
    });
    const d = draw({ id: "d1", project_id: "proj-1", amount_requested: 100000, amount_paid: 30000 });
    const { excludedAllocated, remaining } = await remainingBalanceForDraw(supabase, d);
    expect(excludedAllocated).toBe(20000);
    expect(remaining).toBe(50000);
  });

  it("is zero excluded and zero remaining for a draft with no allocations", async () => {
    const supabase = fakeSupabase({
      inv_project_budget_lines: [],
      inv_draw_line_allocations: [],
    });
    const d = draw({ id: "d1", project_id: "proj-1", status: "draft", amount_requested: 5000, amount_paid: 0 });
    const { remaining } = await remainingBalanceForDraw(supabase, d);
    expect(remaining).toBe(0);
  });
});
