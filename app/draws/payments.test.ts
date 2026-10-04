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
  deleteDraw,
  restoreDraw,
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

describe("Mark Paid records each payment as its own receipt", () => {
  // The brief's regression example.
  it("$30,000 in September + $20,000 in October: total $50,000, each keeping its date", async () => {
    expect((await markDrawPaid("d1", "proj-A", 30000, "2026-09-20")).error).toBeUndefined();
    expect((await markDrawPaid("d1", "proj-A", 20000, "2026-10-05")).error).toBeUndefined();

    expect(draw().amount_paid).toBe(50000);
    expect(draw().date_paid).toBe("2026-10-05"); // cache = latest receipt
    expect(live().map((p) => [p.amount, p.date_received])).toEqual([
      [30000, "2026-09-20"],
      [20000, "2026-10-05"],
    ]);
  });

  it("defaults to the collectible balance: requested less owner-paid scope ($80,000)", async () => {
    await markDrawPaid("d1", "proj-A");
    expect(draw().amount_paid).toBe(80000);
    expect(draw().status).toBe("paid");
  });

  it("a second default payment only collects what's left", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    await markDrawPaid("d1", "proj-A");
    expect(draw().amount_paid).toBe(80000);
    expect(live()).toHaveLength(2);
  });

  it("refuses an overpayment unless it's explicitly confirmed", async () => {
    const refused = await markDrawPaid("d1", "proj-A", 85000, "2026-09-20");
    expect(refused.error).toMatch(/more than/i);
    expect(draw().amount_paid).toBe(0);
    expect(live()).toHaveLength(0);

    const confirmed = await markDrawPaid("d1", "proj-A", 85000, "2026-09-20", { confirmOverpayment: true });
    expect(confirmed.error).toBeUndefined();
    expect(draw().amount_paid).toBe(85000);
  });

  it("a double-submit with the same key records one receipt", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "open-1" });
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "open-1" });
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(30000);
  });

  it("a fresh key (the dialog reopened) records a new payment", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "open-1" });
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20", { idempotencyKey: "open-2" });
    expect(live()).toHaveLength(2);
  });

  it("rejects a malformed date and a zero amount without recording anything", async () => {
    expect((await markDrawPaid("d1", "proj-A", 100, "09/20/2026")).error).toMatch(/valid date/i);
    expect((await markDrawPaid("d1", "proj-A", 0, "2026-09-20")).error).toBeTruthy();
    expect(live()).toHaveLength(0);
  });

  it("defaults a missing approved amount, keeps a genuine partial approval", async () => {
    seed({ amount_approved: 0, status: "submitted" });
    await markDrawPaid("d1", "proj-A", 1000, "2026-09-20");
    expect(draw().amount_approved).toBe(100000);

    seed({ amount_approved: 90000 });
    await markDrawPaid("d1", "proj-A", 1000, "2026-09-20");
    expect(draw().amount_approved).toBe(90000);
  });
});

describe("status dropdown → paid", () => {
  it("a draw with nothing received gets one receipt of the collectible amount, not the raw requested total", async () => {
    await updateDrawStatus("d1", "proj-A", "paid", "key-1");
    expect(draw().amount_paid).toBe(80000);
    expect(live()).toHaveLength(1);
    expect(draw().status).toBe("paid");
  });

  it("works for a draft moved straight to paid, and defaults the approval", async () => {
    seed({ status: "draft", amount_approved: 0 });
    await updateDrawStatus("d1", "proj-A", "paid");
    expect(draw().amount_paid).toBe(80000);
    expect(draw().amount_approved).toBe(100000);
  });

  it("leaves an existing partial payment alone — only the status changes", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    draw().status = "approved";
    await updateDrawStatus("d1", "proj-A", "paid");
    expect(draw().amount_paid).toBe(30000);
    expect(live()).toHaveLength(1);
    expect(draw().status).toBe("paid");
  });

  it("a retried status change with the same key records the payment once", async () => {
    await updateDrawStatus("d1", "proj-A", "paid", "same");
    // The first response was lost and the page still looks unpaid: the retry
    // reaches the database function with the same key and must not double-apply.
    draw().status = "approved";
    draw().amount_paid = 0;
    const retry = await updateDrawStatus("d1", "proj-A", "paid", "same");
    expect(retry.error).toBeUndefined();
    expect(live()).toHaveLength(1);
  });
});

describe("edit form save: upsertDraw", () => {
  it("records the collectible default from the allocations being saved, even though none were saved yet", async () => {
    seed({}, false); // no saved allocations at all
    const result = await upsertDraw(
      form(
        { status: "paid", payment_mode: "default", payment_amount: "999999", payment_date: "2026-10-01", payment_key: "k1" },
        [
          { budget_line_id: "l-hta", amount: 80000 },
          { budget_line_id: "l-owner", amount: 20000 },
        ]
      )
    );
    expect(result.error).toBeUndefined();
    // The client's own "amount" is ignored in default mode; the server derives $80,000.
    expect(live().map((p) => p.amount)).toEqual([80000]);
    expect(draw().amount_paid).toBe(80000);
    expect(draw().date_paid).toBe("2026-10-01");
  });

  it("never writes amount_paid or date_paid straight from the form", async () => {
    const fd = form({ status: "approved" });
    fd.set("amount_paid", "123456");
    fd.set("date_paid", "2026-01-01");
    await upsertDraw(fd);
    expect(draw().amount_paid).toBe(0);
    expect(draw().date_paid).toBeNull();
  });

  it("ignores any client-supplied owner-paid total", async () => {
    const fd = form(
      { status: "paid", payment_mode: "default", payment_date: "2026-10-01", payment_key: "k2" },
      [{ budget_line_id: "l-hta", amount: 100000 }] // nothing owner-paid in what's being saved
    );
    fd.set("excluded_allocated", "99999");
    fd.set("owner_paid", "99999");
    await upsertDraw(fd);
    expect(draw().amount_paid).toBe(100000); // no owner-paid scope, so the full amount
  });

  it("an explicit amount above what's collectible is rejected and NOTHING is saved", async () => {
    const result = await upsertDraw(
      form(
        { amount_requested: "100000", notes: "should not land", payment_mode: "explicit", payment_amount: "95000", payment_date: "2026-10-01" },
        [{ budget_line_id: "l-owner", amount: 20000 }]
      )
    );
    expect(result.error).toMatch(/more than/i);
    expect(draw().notes).toBeNull();
    expect(live()).toHaveLength(0);
  });

  it("the same explicit amount saves once the overpayment is confirmed", async () => {
    const result = await upsertDraw(
      form(
        {
          payment_mode: "explicit",
          payment_amount: "95000",
          payment_date: "2026-10-01",
          payment_key: "k3",
          confirm_overpayment: "true",
        },
        [{ budget_line_id: "l-owner", amount: 20000 }]
      )
    );
    expect(result.error).toBeUndefined();
    expect(draw().amount_paid).toBe(95000);
  });

  it("a retried save with the same payment key records the payment once", async () => {
    const fields = { status: "paid", payment_mode: "default", payment_date: "2026-10-01", payment_key: "same" };
    const allocs = [{ budget_line_id: "l-owner", amount: 20000 }];
    await upsertDraw(form(fields, allocs));
    await upsertDraw(form(fields, allocs));
    expect(live()).toHaveLength(1);
  });

  it("with no payment intent, saving doesn't touch payments at all", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    await upsertDraw(form({ notes: "just a note", status: "paid" }));
    expect(draw().notes).toBe("just a note");
    expect(live()).toHaveLength(1);
    expect(draw().amount_paid).toBe(30000);
  });

  it("when only the payment fails, says the draw was saved and what failed", async () => {
    draw().amount_paid = 500; // cache disagrees with receipts (none) → the database function refuses
    const result = await upsertDraw(
      form({ notes: "saved anyway", payment_mode: "default", payment_date: "2026-10-01" }, [])
    );
    expect(result.error).toMatch(/draw was saved/i);
    expect(result.error).toMatch(/payment/i);
    expect(draw().notes).toBe("saved anyway");
    expect(live()).toHaveLength(0);
  });

  it("creates a new draw and records its payment", async () => {
    const fd = form(
      { id: "", draw_number: "2", status: "paid", payment_mode: "explicit", payment_amount: "5000", payment_date: "2026-10-01", payment_key: "n1" },
      [{ budget_line_id: "l-hta", amount: 5000 }]
    );
    fd.delete("id");
    fd.set("amount_requested", "5000");
    const result = await upsertDraw(fd);
    expect(result.error).toBeUndefined();
    const created = tables.inv_owner_draws.find((d) => d.draw_number === 2)!;
    expect(created.amount_paid).toBe(5000);
    expect(tables.inv_draw_payments.filter((p) => p.draw_id === created.id)).toHaveLength(1);
  });

  it("defaults a missing approved amount when a draw is saved as paid", async () => {
    seed({ amount_approved: 0 });
    await upsertDraw(form({ status: "paid", amount_approved: "0" }));
    expect(draw().amount_approved).toBe(100000);
  });
});

describe("void and correct", () => {
  async function twoPayments() {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    await markDrawPaid("d1", "proj-A", 20000, "2026-10-05");
    return live().map((p) => p.id as string);
  }

  it("voiding a receipt recomputes the total and last date", async () => {
    const [, second] = await twoPayments();
    expect((await voidPayment(second, "d1", "proj-A")).error).toBeUndefined();
    expect(draw().amount_paid).toBe(30000);
    expect(draw().date_paid).toBe("2026-09-20");
    expect(tables.inv_draw_payments).toHaveLength(2); // history kept, marked void
  });

  it("won't void a payment through the wrong project", async () => {
    const [first] = await twoPayments();
    expect((await voidPayment(first, "d1", "proj-OTHER")).error).toBeTruthy();
    expect(draw().amount_paid).toBe(50000);
  });

  it("correcting replaces the receipt's amount and date atomically", async () => {
    const [first] = await twoPayments();
    expect((await correctPayment(first, "d1", "proj-A", 25000, "2026-09-25", "fix")).error).toBeUndefined();
    expect(draw().amount_paid).toBe(45000);
    expect(live().map((p) => [p.amount, p.date_received]).sort()).toEqual([
      [20000, "2026-10-05"],
      [25000, "2026-09-25"],
    ]);
  });

  it("rejects an invalid correction before touching anything", async () => {
    const [first] = await twoPayments();
    expect((await correctPayment(first, "d1", "proj-A", 0, "2026-09-25")).error).toBeTruthy();
    expect((await correctPayment(first, "d1", "proj-A", 100, "not-a-date")).error).toBeTruthy();
    expect(draw().amount_paid).toBe(50000);
  });
});

describe("Trash and restore", () => {
  it("trashing a draw leaves its receipts in place, and restoring brings the history back", async () => {
    await markDrawPaid("d1", "proj-A", 30000, "2026-09-20");
    await deleteDraw("d1", "proj-A");
    expect(draw().deleted_at).toBeTruthy();
    expect(live()).toHaveLength(1);

    await restoreDraw("d1", "proj-A");
    expect(draw().deleted_at).toBeNull();
    expect((await markDrawPaid("d1", "proj-A", 20000, "2026-10-05")).error).toBeUndefined();
    expect(draw().amount_paid).toBe(50000);
  });

  it("can't record a payment on a trashed draw", async () => {
    await deleteDraw("d1", "proj-A");
    expect((await markDrawPaid("d1", "proj-A", 100, "2026-09-20")).error).toBeTruthy();
    expect(live()).toHaveLength(0);
  });
});
