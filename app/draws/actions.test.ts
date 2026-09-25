import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

// upsertDraw calls revalidatePath, which relies on Next.js request-scoped
// state that doesn't exist under plain Vitest — stub it to a no-op so the
// real mutation function can be exercised directly.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let tables: Record<string, Record<string, unknown>[]>;
let raceHooks: Record<string, (row: Record<string, unknown>) => void> = {};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables, { raceHooks }),
}));

// Imported after the mocks above so the module under test picks them up.
const { upsertDraw, markDrawPaid, updateDrawStatus } = await import("@/app/draws/actions");

function draw(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    project_id: "proj-1",
    draw_number: 1,
    period_start: null,
    period_end: null,
    amount_requested: 100000,
    amount_approved: 100000,
    retainage_held: 0,
    amount_paid: 0,
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

function formDataFor(id: string, projectId: string, overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("project_id", projectId);
  fd.set("draw_number", overrides.draw_number ?? "1");
  fd.set("amount_requested", overrides.amount_requested ?? "100000");
  fd.set("amount_approved", overrides.amount_approved ?? "100000");
  fd.set("retainage_held", overrides.retainage_held ?? "0");
  fd.set("amount_paid", overrides.amount_paid ?? "0");
  fd.set("status", overrides.status ?? "approved");
  fd.set("allocations", "[]");
  return fd;
}

beforeEach(() => {
  raceHooks = {};
  tables = { inv_owner_draws: [], inv_draw_line_allocations: [] };
});

describe("upsertDraw — project ownership enforcement", () => {
  it("rejects an edit whose submitted project_id doesn't match the draw's actual project", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A" }));

    const result = await upsertDraw(formDataFor("d1", "proj-B"));

    expect(result.error).toMatch(/different project/i);
    // Nothing was written — the row's own project_id is untouched.
    expect(tables.inv_owner_draws[0].project_id).toBe("proj-A");
    expect(tables.inv_owner_draws[0].amount_requested).toBe(100000);
  });

  it("rejects an edit on a soft-deleted draw", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", deleted_at: "2026-02-01T00:00:00Z" }));

    const result = await upsertDraw(formDataFor("d1", "proj-A"));

    expect(result.error).toMatch(/deleted/i);
  });

  it("allows an edit when the project matches and the draw is live", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", amount_requested: 100000 }));

    const result = await upsertDraw(
      formDataFor("d1", "proj-A", { amount_requested: "125000" })
    );

    expect(result.error).toBeUndefined();
    expect(tables.inv_owner_draws[0].amount_requested).toBe(125000);
  });

  it("fails cleanly instead of silently succeeding when the row is altered between the lookup and the write (simulated race)", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A" }));
    // Right after upsertDraw's own lookup reads this row (and sees it as
    // live, matching project-A), simulate a concurrent delete before the
    // write executes.
    raceHooks.inv_owner_draws = (row) => {
      row.deleted_at = "2026-02-01T00:00:00Z";
    };

    const result = await upsertDraw(formDataFor("d1", "proj-A", { amount_requested: "999999" }));

    expect(result.error).toBeTruthy();
    // The write's own deleted_at guard caught it — no partial write landed.
    expect(tables.inv_owner_draws[0].amount_requested).toBe(100000);
  });
});

describe("markDrawPaid — same invariants, exercised as the actual mutation function", () => {
  it("rejects a payment on a draw belonging to a different project", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", amount_requested: 100000 }));

    const result = await markDrawPaid("d1", "proj-B");

    expect(result.error).toBeTruthy();
    expect(tables.inv_owner_draws[0].amount_paid).toBe(0);
  });

  it("rejects a payment on a soft-deleted draw", async () => {
    tables.inv_owner_draws.push(
      draw({ id: "d1", project_id: "proj-A", deleted_at: "2026-02-01T00:00:00Z" })
    );

    const result = await markDrawPaid("d1", "proj-A");

    expect(result.error).toBeTruthy();
  });

  it("pays the full remaining balance when no amount is given", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", amount_requested: 100000, amount_paid: 0 }));

    const result = await markDrawPaid("d1", "proj-A");

    expect(result.error).toBeUndefined();
    expect(tables.inv_owner_draws[0].amount_paid).toBe(100000);
    expect(tables.inv_owner_draws[0].status).toBe("paid");
  });
});

describe("updateDrawStatus — same invariants, exercised as the actual mutation function", () => {
  it("rejects a status change on a draw belonging to a different project", async () => {
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", status: "submitted" }));

    const result = await updateDrawStatus("d1", "proj-B", "approved");

    expect(result.error).toBeTruthy();
    expect(tables.inv_owner_draws[0].status).toBe("submitted");
  });

  it("marking paid defaults amount_paid to requested minus owner-paid scope, not the raw requested total", async () => {
    tables.inv_owner_draws.push(
      draw({ id: "d1", project_id: "proj-A", amount_requested: 100000, amount_paid: 0, status: "approved" })
    );
    tables.inv_project_budget_lines = [
      { id: "owner-scope", project_id: "proj-A", excluded_from_contract: true, deleted_at: null },
    ];
    tables.inv_draw_line_allocations = [{ draw_id: "d1", budget_line_id: "owner-scope", amount: 20000 }];

    const result = await updateDrawStatus("d1", "proj-A", "paid");

    expect(result.error).toBeUndefined();
    expect(tables.inv_owner_draws[0].amount_paid).toBe(80000);
  });
});
