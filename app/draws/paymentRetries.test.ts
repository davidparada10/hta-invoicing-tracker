import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";
import { fakePaymentRpc } from "@/lib/testUtils/fakePaymentRpc";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables, { rpc: fakePaymentRpc }),
}));

const {
  upsertDraw,
  markDrawPaid,
  updateDrawStatus,
  voidPayment,
  correctPayment,
} = await import("@/app/draws/actions");

// Project A: one HTA line, one owner-paid (excluded_from_contract) line. A draw
// of $100,000 with $20,000 billed to the owner-paid line collects $80,000.
function seed(drawOverrides: Row = {}, allocations = true) {
  tables = {
    inv_projects: [{ id: "proj-A", name: "Project A" }],
    inv_project_budget_lines: [
      { id: "l-hta", project_id: "proj-A", excluded_from_contract: false, deleted_at: null },
      { id: "l-owner", project_id: "proj-A", excluded_from_contract: true, deleted_at: null },
    ],
    inv_owner_draws: [
      {
        id: "d1",
        project_id: "proj-A",
        draw_number: 1,
        amount_requested: 100000,
        amount_approved: 100000,
        retainage_held: 0,
        amount_paid: 0,
        date_paid: null,
        date_submitted: "2026-09-01",
        date_approved: null,
        status: "approved",
        notes: null,
        created_at: "2026-09-01T00:00:00Z",
        deleted_at: null,
        ...drawOverrides,
      },
    ],
    inv_draw_line_allocations: allocations
      ? [
          { id: "a1", draw_id: "d1", budget_line_id: "l-hta", amount: 80000 },
          { id: "a2", draw_id: "d1", budget_line_id: "l-owner", amount: 20000 },
        ]
      : [],
    inv_draw_payments: [],
  };
}

const draw = () => tables.inv_owner_draws[0];
const live = () => tables.inv_draw_payments.filter((p) => !p.deleted_at);

function form(fields: Record<string, string>, allocations: { budget_line_id: string; amount: number }[] = []) {
  const fd = new FormData();
  const base: Record<string, string> = {
    id: "d1",
    project_id: "proj-A",
    draw_number: "1",
    amount_requested: "100000",
    amount_approved: "100000",
    retainage_held: "0",
    status: "approved",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
  fd.set("allocations", JSON.stringify(allocations));
  return fd;
}

beforeEach(() => seed());


// A payment request can be retried after its response was lost. The retry must
// get the original answer — not a "no outstanding balance" / overpayment error
// caused by the payment it is repeating — and must never record twice.

describe("retries: Mark Paid", () => {
  it("full payment succeeds, the response is lost, an identical retry succeeds with one receipt", async () => {
    const opts = { idempotencyKey: "k-full" };
    expect((await markDrawPaid("d1", "proj-A", 80000, "2026-09-20", opts)).error).toBeUndefined();
    // balance is now 0 — the old order of checks rejected this retry
    const retry = await markDrawPaid("d1", "proj-A", 80000, "2026-09-20", opts);
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(80000);
  });

  it("partial payment retry records only one receipt", async () => {
    const opts = { idempotencyKey: "k-part" };
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", opts);
    const retry = await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", opts);
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(30000);
  });

  it("a default-amount retry does not collect a second amount from the changed balance", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-01"); // $50,000 still collectible
    const opts = { idempotencyKey: "k-default" };
    await markDrawPaid("d1", "proj-A", undefined, undefined, opts); // records the $50,000
    expect(draw().amount_paid).toBe(80000);
    const retry = await markDrawPaid("d1", "proj-A", undefined, undefined, opts);
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(2);
    expect(draw().amount_paid).toBe(80000);
  });

  it("an overpayment that was confirmed and recorded still replays without needing the confirmation again", async () => {
    const opts = { idempotencyKey: "k-over", confirmOverpayment: true };
    await markDrawPaid("d1", "proj-A", 85000, "2026-09-20", opts);
    const retry = await markDrawPaid("d1", "proj-A", 85000, "2026-09-20", { idempotencyKey: "k-over" });
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
  });

  it("the same key with a changed explicit amount is a clear conflict, not a silent success", async () => {
    const opts = { idempotencyKey: "k-conflict" };
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", opts);
    const changedAmount = await markDrawPaid("d1", "proj-A", 31000, "2026-09-20", opts);
    expect(changedAmount.error).toMatch(/already used for \$30,000/);
    const changedDate = await markDrawPaid("d1", "proj-A", 30000, "2026-09-21", opts);
    expect(changedDate.error).toMatch(/different amount or date/);
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(30000);
  });

  it("the database itself refuses key reuse with a different explicit amount, whatever the app pre-checked", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "k-race" });
    expect(() =>
      fakePaymentRpc.record_draw_payment(
        { p_draw_id: "d1", p_amount: 99, p_date: "2026-09-20", p_source: "manual", p_idempotency_key: "k-race", p_amount_explicit: true },
        tables
      )
    ).toThrow();
    expect(live()).toHaveLength(1);
  });

  it("concurrent duplicate requests record exactly one receipt", async () => {
    const opts = { idempotencyKey: "k-concurrent" };
    const results = await Promise.all([
      markDrawPaid("d1", "proj-A", 80000, "2026-09-20", opts),
      markDrawPaid("d1", "proj-A", 80000, "2026-09-20", opts),
      markDrawPaid("d1", "proj-A", 80000, "2026-09-20", opts),
    ]);
    expect(results.every((r) => r.error === undefined)).toBe(true);
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(80000);
  });

  it("a retry after the receipt was voided does not reinstate it", async () => {
    const opts = { idempotencyKey: "k-void" };
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", opts);
    await voidPayment(String(live()[0].id), "d1", "proj-A");
    expect(draw().amount_paid).toBe(0);

    const retry = await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", opts);
    expect(retry.error).toMatch(/voided/i);
    expect(live()).toHaveLength(0);
    expect(draw().amount_paid).toBe(0);
  });

  it("still refuses deleted draws and the wrong project, even with a key that has a receipt", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "k-guard" });
    expect((await markDrawPaid("d1", "proj-OTHER", 30000, "2026-09-20", { idempotencyKey: "k-guard" })).error).toMatch(/no longer exists/);
    draw().deleted_at = "2026-10-01";
    expect((await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "k-guard" })).error).toMatch(/no longer exists/);
  });

  it("a new key on a settled draw is still rejected: there is nothing left to collect", async () => {
    await markDrawPaid("d1", "proj-A", 80000, "2026-09-20", { idempotencyKey: "k1" });
    expect((await markDrawPaid("d1", "proj-A", undefined, undefined, { idempotencyKey: "k2" })).error).toMatch(/greater than zero/);
    expect(live()).toHaveLength(1);
  });
});

describe("retries: status dropdown", () => {
  it("a retried change to paid replays without a second receipt", async () => {
    await updateDrawStatus("d1", "proj-A", "paid", "s1");
    const retry = await updateDrawStatus("d1", "proj-A", "paid", "s1");
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
  });

  it("after the payment was voided, the same key does not reinstate it", async () => {
    await updateDrawStatus("d1", "proj-A", "paid", "s2");
    await voidPayment(String(live()[0].id), "d1", "proj-A");
    const retry = await updateDrawStatus("d1", "proj-A", "paid", "s2");
    expect(retry.error).toMatch(/voided/i);
    expect(live()).toHaveLength(0);
  });
});

describe("retries: edit-form save", () => {
  const allocs = [{ budget_line_id: "l-owner", amount: 20000 }];

  it("a default-payment save retried after success returns success and records once", async () => {
    const fields = { status: "paid", payment_mode: "default", payment_date: "2026-10-01", payment_key: "f1" };
    expect((await upsertDraw(form(fields, allocs))).error).toBeUndefined();
    const retry = await upsertDraw(form(fields, allocs));
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(80000);
  });

  it("an explicit full payment retried after it cleared the balance is not rejected as an overpayment", async () => {
    const fields = { status: "paid", payment_mode: "explicit", payment_amount: "80000", payment_date: "2026-10-01", payment_key: "f2" };
    await upsertDraw(form(fields, allocs));
    const retry = await upsertDraw(form(fields, allocs));
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
  });

  it("the same key with a changed amount or date is refused and the draw isn't re-saved", async () => {
    const fields = { status: "paid", payment_mode: "explicit", payment_amount: "30000", payment_date: "2026-10-01", payment_key: "f3" };
    await upsertDraw(form(fields, allocs));
    const changed = await upsertDraw(form({ ...fields, payment_amount: "35000", notes: "edited" }, allocs));
    expect(changed.error).toMatch(/already used/);
    expect(draw().notes).toBeNull();
    expect(live()).toHaveLength(1);
  });

  it("after a void the same key doesn't reinstate the payment", async () => {
    const fields = { status: "paid", payment_mode: "explicit", payment_amount: "30000", payment_date: "2026-10-01", payment_key: "f4" };
    await upsertDraw(form(fields, allocs));
    await voidPayment(String(live()[0].id), "d1", "proj-A");
    const retry = await upsertDraw(form(fields, allocs));
    expect(retry.error).toMatch(/voided/i);
    expect(live()).toHaveLength(0);
  });
});

describe("retries: correction", () => {
  it("a retried correction replays, and the same key with a different amount conflicts", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    const id = String(live()[0].id);
    expect((await correctPayment(id, "d1", "proj-A", 25000, "2026-09-25", "c1")).error).toBeUndefined();
    expect((await correctPayment(id, "d1", "proj-A", 25000, "2026-09-25", "c1")).error).toBeUndefined();
    expect(live()).toHaveLength(1);
    expect((await correctPayment(id, "d1", "proj-A", 26000, "2026-09-25", "c1")).error).toMatch(/different payment/i);
    expect(draw().amount_paid).toBe(25000);
  });
});
