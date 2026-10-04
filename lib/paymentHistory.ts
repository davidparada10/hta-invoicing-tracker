// Pure helpers over per-draw payment receipts (inv_draw_payments). See
// supabase/migrations/20261001120000_add_draw_payments.sql for the table and
// the atomic record/void/correct functions; writes never happen here — they go
// through lib/paymentsRepo.ts so the DB keeps the cached draw totals in step.
//
// The bug this replaces: inv_owner_draws.amount_paid accumulated but date_paid
// was a flat overwrite, so $30k in September plus $20k in October reported the
// full $50k in October. Each receipt keeps its own amount and date, and period
// reports bucket per receipt.

export interface DrawPayment {
  id: string;
  draw_id: string;
  amount: number;
  date_received: string; // YYYY-MM-DD
  source: "manual" | "ai" | "legacy";
  idempotency_key: string | null;
  // True when a legacy receipt's date was inferred (the draw had money but no
  // date_paid), so it can be audited.
  date_inferred?: boolean;
  created_at: string;
  deleted_at: string | null;
}

import { paidDate } from "@/lib/billingDates";

const round2 = (n: number) => Math.round(n * 100) / 100;

function live(payments: DrawPayment[]): DrawPayment[] {
  return payments.filter((p) => p.deleted_at === null);
}

export function totalPaid(payments: DrawPayment[]): number {
  return round2(live(payments).reduce((acc, p) => acc + p.amount, 0));
}

// The cached inv_owner_draws.date_paid under this model: the most recent live
// receipt's date. Kept for display ("last payment date") — period bucketing
// must read each receipt's own date_received instead (see paymentsByPeriod).
export function lastPaymentDate(payments: DrawPayment[]): string | null {
  const dates = live(payments).map((p) => p.date_received);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

// Buckets each live receipt by its own date — the fix for "$50,000 reported in
// October", where a draw's whole amount_paid landed in its single date_paid's
// period regardless of when each dollar actually arrived.
export function paymentsByPeriod(
  payments: DrawPayment[],
  periodKey: (dateReceived: string) => string
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of live(payments)) {
    const key = periodKey(p.date_received);
    totals.set(key, round2((totals.get(key) ?? 0) + p.amount));
  }
  return totals;
}

type LegacyDrawFields = {
  id: string;
  amount_paid: number;
  date_paid: string | null;
  date_submitted: string | null;
  created_at: string;
};

// The one receipt a legacy draw (money received, no receipt rows) is treated
// as having: its known total, dated like the migration's backfill does — the
// real date_paid when there is one, else the date reports already used for it
// (lib/billingDates.ts paidDate: submitted, then created). It invents no
// installment history: it can't know which dollars arrived when.
export function syntheticLegacyPayment(
  draw: LegacyDrawFields,
  businessDate: (isoTimestamp: string) => string
): DrawPayment | null {
  if (!(draw.amount_paid > 0)) return null;
  const inferred = draw.date_paid === null;
  const date = draw.date_paid ?? draw.date_submitted ?? businessDate(draw.created_at);
  return {
    id: `legacy:${draw.id}`,
    draw_id: draw.id,
    amount: draw.amount_paid,
    date_received: date,
    source: "legacy",
    idempotency_key: null,
    date_inferred: inferred,
    created_at: draw.created_at,
    deleted_at: null,
  };
}

// Every receipt the reports should see: the real rows for draws that have
// them, plus one synthetic legacy receipt for any draw that has money received
// but no rows (pre-migration, or the table isn't deployed yet). This keeps
// every report on one code path — receipts — whether or not a draw has been
// migrated. Receipts of draws not in `draws` (e.g. trashed) are dropped.
export function paymentsForDraws(
  draws: LegacyDrawFields[],
  rows: DrawPayment[],
  businessDate: (isoTimestamp: string) => string
): DrawPayment[] {
  const liveIds = new Set(draws.map((d) => d.id));
  const byDraw = new Map<string, DrawPayment[]>();
  for (const r of rows) {
    if (!liveIds.has(r.draw_id)) continue;
    const list = byDraw.get(r.draw_id) ?? [];
    list.push(r);
    byDraw.set(r.draw_id, list);
  }
  const out: DrawPayment[] = [];
  for (const d of draws) {
    const own = byDraw.get(d.id);
    if (own && own.length > 0) {
      out.push(...own);
      continue;
    }
    const legacy = syntheticLegacyPayment(d, businessDate);
    if (legacy) out.push(legacy);
  }
  return out;
}

// days-to-pay, with this model, is days from submission (or creation) to the
// LAST live receipt of the draw — the same meaning it has today ("how long
// until this draw was closed out"), not days to the first partial payment or an
// average across installments. Written down here so it isn't left to guess.
export function daysToLastPayment(
  payments: DrawPayment[],
  submittedOrCreatedISO: string,
  calendarDaysBetween: (aISO: string, b: Date) => number,
  parseLocalDate: (value: string) => Date
): number | null {
  const last = lastPaymentDate(payments);
  if (last === null) return null;
  return Math.max(0, calendarDaysBetween(submittedOrCreatedISO, parseLocalDate(last)));
}

// ---- Reading receipts for reports ----------------------------------------

export type ReceiptsByDraw = Map<string, DrawPayment[]>;

export interface Receipt {
  amount: number;
  date: string;
}

type ReceiptDraw = {
  id?: string;
  amount_paid: number | null;
  date_paid: string | null;
  date_submitted: string | null;
  created_at: string;
};

/** Live receipts grouped by draw id. */
export function groupLiveReceipts(payments: DrawPayment[]): ReceiptsByDraw {
  const byDraw: ReceiptsByDraw = new Map();
  for (const p of payments) {
    if (p.deleted_at) continue;
    const list = byDraw.get(p.draw_id) ?? [];
    list.push(p);
    byDraw.set(p.draw_id, list);
  }
  return byDraw;
}

/**
 * The receipts a report should count for a draw. Each real receipt keeps its
 * own amount and date. A draw with no receipt rows (pre-migration, or the
 * table isn't deployed yet) is read as one receipt of its cached amount_paid
 * on the date reports have always used for it (billingDates.paidDate), so it
 * reports exactly as it did before.
 */
export function receiptsForDraw(d: ReceiptDraw, byDraw: ReceiptsByDraw): Receipt[] {
  const rows = d.id ? byDraw.get(d.id) : undefined;
  if (rows && rows.length > 0) return rows.map((r) => ({ amount: r.amount, date: r.date_received }));
  const amount = d.amount_paid ?? 0;
  return amount > 0 ? [{ amount, date: paidDate(d) }] : [];
}

/**
 * The date a draw's last real payment landed: the latest receipt, or the
 * cached date_paid for a draw with no receipt rows. Null when there is no real
 * payment date, so a missing date never reads as "paid in 0 days".
 */
export function lastReceiptDate(d: { id?: string; date_paid: string | null }, byDraw: ReceiptsByDraw): string | null {
  const rows = d.id ? byDraw.get(d.id) : undefined;
  if (rows && rows.length > 0) return rows.map((r) => r.date_received).reduce((m, x) => (x > m ? x : m));
  return d.date_paid;
}
