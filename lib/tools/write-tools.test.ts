import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";
import { fakePaymentRpc } from "@/lib/testUtils/fakePaymentRpc";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let tables: Record<string, Record<string, unknown>[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables, { rpc: fakePaymentRpc }),
}));

const { markDrawPaidTool, updateDrawTool, createDrawTool } = await import("@/lib/tools/write-tools");

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

  it("markDrawPaidTool defaults amount_approved to requested when the draw was never approved", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_owner_draws.push(
      draw({ id: "d1", project_id: "proj-A", draw_number: 1, amount_requested: 100000, amount_approved: 0, status: "submitted" })
    );

    await markDrawPaidTool.execute!(
      { projectName: "Project A", drawNumber: 1 },
      { toolCallId: "t1", messages: [], context: undefined as never }
    );

    expect(tables.inv_owner_draws[0].amount_approved).toBe(100000);
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

describe("markDrawPaidTool — payments are individual receipts", () => {
  const ctx = (id: string) => ({ toolCallId: id, messages: [], context: undefined as never });
  const run = (input: Record<string, unknown>, id = "call-1") =>
    markDrawPaidTool.execute!({ projectName: "Project A", drawNumber: 1, ...input } as never, ctx(id));
  const receipts = () => tables.inv_draw_payments.filter((p) => !p.deleted_at);

  function seedDraw(overrides: Record<string, unknown> = {}) {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    tables.inv_owner_draws.push(draw({ id: "d1", project_id: "proj-A", draw_number: 1, ...overrides }));
    tables.inv_project_budget_lines.push(
      { id: "l-hta", project_id: "proj-A", excluded_from_contract: false, deleted_at: null },
      { id: "l-owner", project_id: "proj-A", excluded_from_contract: true, deleted_at: null }
    );
    tables.inv_draw_line_allocations.push(
      { id: "a1", draw_id: "d1", budget_line_id: "l-hta", amount: 80000 },
      { id: "a2", draw_id: "d1", budget_line_id: "l-owner", amount: 20000 }
    );
    tables.inv_draw_payments = [];
  }

  it("$30,000 in September + $20,000 in October: each is its own receipt with its own date", async () => {
    seedDraw();
    await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "c1");
    await run({ amountReceived: 20000, datePaid: "2026-10-05" }, "c2");
    expect(tables.inv_owner_draws[0].amount_paid).toBe(50000);
    expect(receipts().map((r) => [r.amount, r.date_received, r.source])).toEqual([
      [30000, "2026-09-20", "ai"],
      [20000, "2026-10-05", "ai"],
    ]);
  });

  it("a retried call (same tool-call id) is recorded once and reports it was already recorded", async () => {
    seedDraw();
    await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "same-call");
    const retry = await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "same-call");
    expect(receipts()).toHaveLength(1);
    expect(retry).toMatchObject({ success: true, alreadyRecorded: true });
  });

  it("full payment, lost response, identical retry: success, one receipt (not 'no outstanding balance')", async () => {
    seedDraw();
    await run({ amountReceived: 80000, datePaid: "2026-09-20" }, "full");
    const retry = await run({ amountReceived: 80000, datePaid: "2026-09-20" }, "full");
    expect(retry).toMatchObject({ success: true, alreadyRecorded: true });
    expect(receipts()).toHaveLength(1);
  });

  it("a default-amount retry doesn't collect a second amount from the changed balance", async () => {
    seedDraw();
    await run({ amountReceived: 30000, datePaid: "2026-09-01" }, "first");
    await run({}, "rest"); // collects the remaining $50,000
    const retry = await run({}, "rest");
    expect(retry).toMatchObject({ success: true, alreadyRecorded: true });
    expect(receipts()).toHaveLength(2);
    expect(tables.inv_owner_draws[0].amount_paid).toBe(80000);
  });

  it("the same tool-call id with a changed amount or date is a conflict", async () => {
    seedDraw();
    await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "conflict");
    expect(await run({ amountReceived: 31000, datePaid: "2026-09-20" }, "conflict")).toMatchObject({
      error: expect.stringMatching(/already used/),
    });
    expect(await run({ amountReceived: 30000, datePaid: "2026-09-21" }, "conflict")).toMatchObject({
      error: expect.stringMatching(/already used/),
    });
    expect(receipts()).toHaveLength(1);
  });

  it("a retry after the receipt was voided does not reinstate it", async () => {
    seedDraw();
    await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "voided");
    fakePaymentRpc.void_draw_payment({ p_payment_id: receipts()[0].id, p_draw_id: "d1" }, tables);
    const retry = await run({ amountReceived: 30000, datePaid: "2026-09-20" }, "voided");
    expect(retry).toMatchObject({ error: expect.stringMatching(/voided/i) });
    expect(receipts()).toHaveLength(0);
    expect(tables.inv_owner_draws[0].amount_paid).toBe(0);
  });

  it("concurrent duplicate calls record one receipt", async () => {
    seedDraw();
    const results = await Promise.all([1, 2, 3].map(() => run({ amountReceived: 80000, datePaid: "2026-09-20" }, "same")));
    expect(results.every((r) => (r as { success?: boolean }).success)).toBe(true);
    expect(receipts()).toHaveLength(1);
  });

  it("two different calls for the same amount are two payments", async () => {
    seedDraw();
    await run({ amountReceived: 10000, datePaid: "2026-09-20" }, "a");
    await run({ amountReceived: 10000, datePaid: "2026-09-20" }, "b");
    expect(receipts()).toHaveLength(2);
  });

  it("refuses an overpayment unless the user's confirmation is passed through", async () => {
    seedDraw();
    const refused = await run({ amountReceived: 85000, datePaid: "2026-09-20" }, "o1");
    expect(refused).toHaveProperty("error");
    expect(receipts()).toHaveLength(0);

    const ok = await run({ amountReceived: 85000, datePaid: "2026-09-20", confirmOverpayment: true }, "o2");
    expect(ok).toMatchObject({ success: true });
    expect(tables.inv_owner_draws[0].amount_paid).toBe(85000);
  });

  it("rejects a malformed date", async () => {
    seedDraw();
    expect(await run({ amountReceived: 100, datePaid: "yesterday" })).toHaveProperty("error");
    expect(receipts()).toHaveLength(0);
  });

  it("createDrawTool won't create an already-paid draw with nothing received against it", async () => {
    tables.inv_projects.push(project({ id: "proj-A", name: "Project A" }));
    const result = await createDrawTool.execute!(
      { projectName: "Project A", drawNumber: 5, amountRequested: 1000, status: "paid" } as never,
      ctx("c")
    );
    expect(result).toHaveProperty("error");
    expect(tables.inv_owner_draws).toHaveLength(0);
  });
});
