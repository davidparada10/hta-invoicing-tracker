import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let tables: Record<string, Record<string, unknown>[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { markDrawPaidTool, updateDrawTool } = await import("@/lib/tools/write-tools");

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-A",
    name: "Project A",
    project_number: "1",
    address: null,
    lender: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    draw_due_type: null,
    draw_due_day: null,
    ...overrides,
  };
}

function draw(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    project_id: "proj-A",
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

beforeEach(() => {
  tables = { inv_projects: [], inv_owner_draws: [], inv_project_budget_lines: [], inv_draw_line_allocations: [] };
});

describe("markDrawPaidTool / updateDrawTool — same project-ownership and deleted_at invariants as the manual form", () => {
  it("markDrawPaidTool can't reach a draw number that belongs to a different project", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_projects.push(project({ id: "proj-B", name: "Project B" }));
    // Draw #1 exists only under Project B.
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-B", draw_number: 1 }));

    const result = await markDrawPaidTool.execute!(
      { projectName: "Project A", drawNumber: 1 },
      { toolCallId: "t1", messages: [], context: undefined as never }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not found/i);
    // Project B's draw is untouched.
    expect(tables.inv_owner_draws[0].amount_paid).toBe(0);
  });

  it("markDrawPaidTool can't mark a soft-deleted draw paid", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_owner_draws.push(
      draw({ id: "d1", project_id: "proj-A", draw_number: 1, deleted_at: "2026-02-01T00:00:00Z" })
    );

    const result = await markDrawPaidTool.execute!(
      { projectName: "Project A", drawNumber: 1 },
      { toolCallId: "t1", messages: [], context: undefined as never }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not found/i);
  });

  it("markDrawPaidTool nets excluded_allocated out of the default payment amount", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_owner_draws.push(
      draw({ id: "d1", project_id: "proj-A", draw_number: 1, amount_requested: 100000, amount_paid: 0 })
    );
    tables.inv_project_budget_lines.push({
      id: "owner-scope",
      project_id: "proj-A",
      excluded_from_contract: true,
      deleted_at: null,
    });
    tables.inv_draw_line_allocations.push({ draw_id: "d1", budget_line_id: "owner-scope", amount: 20000 });

    const result = await markDrawPaidTool.execute!(
      { projectName: "Project A", drawNumber: 1 },
      { toolCallId: "t1", messages: [], context: undefined as never }
    );

    expect(result).toMatchObject({ success: true, amountReceived: 80000 });
    expect(tables.inv_owner_draws[0].amount_paid).toBe(80000);
  });

  it("updateDrawTool rejects updates to a draw number that belongs to a different project", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-B", draw_number: 1 }));

    const result = await updateDrawTool.execute!(
      { projectName: "Project A", drawNumber: 1, notes: "should not land" },
      { toolCallId: "t1", messages: [], context: undefined as never }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not found/i);
  });
});
