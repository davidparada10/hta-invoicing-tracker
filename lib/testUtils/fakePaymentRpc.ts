// A JavaScript stand-in for the Postgres functions in
// supabase/migrations/20261001120000_add_draw_payments.sql, so app-level tests
// (server actions, AI tools) can run end to end against the fake Supabase
// client. It is a TEST DOUBLE: lib/paymentsRpcParity.test.ts runs the same
// scripted scenario through this and through the real SQL (PGlite) and
// requires identical outcomes, so the two can't drift apart unnoticed.

import type { FakeRpcHandler } from "@/lib/testUtils/fakeSupabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const round2 = (n: number) => Math.round(n * 100) / 100;

function dbError(code: string, message: string): never {
  throw { code, message };
}

function lockDraw(tables: Record<string, Row[]>, drawId: unknown): Row {
  const draw = (tables.inv_owner_draws ?? []).find((d) => d.id === drawId);
  if (!draw || draw.deleted_at) dbError("P0002", "draw not found or deleted");
  return draw;
}

function recompute(tables: Record<string, Row[]>, draw: Row) {
  const live = (tables.inv_draw_payments ?? []).filter((p) => p.draw_id === draw.id && !p.deleted_at);
  draw.amount_paid = round2(live.reduce((a, p) => a + Number(p.amount), 0));
  draw.date_paid = live.length ? live.map((p) => p.date_received).reduce((m, d) => (d > m ? d : m)) : null;
}

function insertReceipt(
  tables: Record<string, Row[]>,
  drawId: string,
  amount: number,
  date: string,
  source: string,
  key: unknown
): Row {
  const row: Row = {
    id: `pay-${(tables.inv_draw_payments ?? []).length + 1}-${Math.random().toString(36).slice(2, 8)}`,
    draw_id: drawId,
    amount: round2(amount),
    date_received: date,
    source,
    idempotency_key: key ?? null,
    date_inferred: false,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
  (tables.inv_draw_payments ??= []).push(row);
  return row;
}

function totals(draw: Row) {
  return { amount_paid: draw.amount_paid, date_paid: draw.date_paid };
}

function findByKey(tables: Record<string, Row[]>, drawId: unknown, key: unknown): Row | undefined {
  if (key == null) return undefined;
  return (tables.inv_draw_payments ?? []).find((p) => p.draw_id === drawId && p.idempotency_key === key);
}

export const fakePaymentRpc: Record<string, FakeRpcHandler> = {
  record_draw_payment(args, tables) {
    const amount = Number(args.p_amount);
    if (!(amount > 0)) dbError("22023", "payment amount must be greater than zero");
    if (!args.p_date) dbError("22023", "payment date is required");
    const draw = lockDraw(tables, args.p_draw_id);

    const existing = findByKey(tables, draw.id, args.p_idempotency_key);
    if (existing) return { payment: existing, was_duplicate: true, ...totals(draw) };

    const receipts = round2(
      (tables.inv_draw_payments ?? [])
        .filter((p) => p.draw_id === draw.id && !p.deleted_at)
        .reduce((a, p) => a + Number(p.amount), 0)
    );
    if (round2(Number(draw.amount_paid) || 0) !== receipts) {
      dbError("P0001", `payment history drift on draw ${draw.id}: cached amount_paid ${draw.amount_paid} vs receipts ${receipts}`);
    }

    const payment = insertReceipt(tables, draw.id, amount, String(args.p_date), String(args.p_source), args.p_idempotency_key);
    recompute(tables, draw);
    if (args.p_set_paid) {
      draw.status = "paid";
      if (!(Number(draw.amount_approved) > 0)) draw.amount_approved = draw.amount_requested;
    }
    return { payment, was_duplicate: false, ...totals(draw) };
  },

  void_draw_payment(args, tables) {
    const draw = lockDraw(tables, args.p_draw_id);
    const payment = (tables.inv_draw_payments ?? []).find((p) => p.id === args.p_payment_id && p.draw_id === draw.id);
    if (!payment) dbError("P0002", "payment not found on this draw");
    const wasNoop = Boolean(payment.deleted_at);
    if (!wasNoop) {
      payment.deleted_at = new Date().toISOString();
      recompute(tables, draw);
    }
    return { was_noop: wasNoop, ...totals(draw) };
  },

  correct_draw_payment(args, tables) {
    const amount = Number(args.p_new_amount);
    if (!(amount > 0)) dbError("22023", "payment amount must be greater than zero");
    if (!args.p_new_date) dbError("22023", "payment date is required");
    const draw = lockDraw(tables, args.p_draw_id);

    const existing = findByKey(tables, draw.id, args.p_idempotency_key);
    if (existing) return { payment: existing, was_duplicate: true, ...totals(draw) };

    const old = (tables.inv_draw_payments ?? []).find(
      (p) => p.id === args.p_payment_id && p.draw_id === draw.id && !p.deleted_at
    );
    if (!old) dbError("P0002", "live payment not found on this draw");

    old.deleted_at = new Date().toISOString();
    const payment = insertReceipt(tables, draw.id, amount, String(args.p_new_date), "manual", args.p_idempotency_key);
    recompute(tables, draw);
    return { payment, was_duplicate: false, ...totals(draw) };
  },
};
