// Pure logic for a per-draw payment-history model — NOT wired into the live
// app yet. See supabase/migrations/20261001120000_add_draw_payments.sql for
// the proposed inv_draw_payments table this is designed against, and
// DEVLOG.md / the session's final report for exactly what activating this
// would require touching (markDrawPaid, markDrawPaidTool, lib/billing.ts,
// lib/monthlyBilling.ts, getRecentPaymentsTool). Built and tested now so the
// approach is reviewed ahead of that migration actually running, per the
// request's own fallback for this gap: "complete the other independent
// fixes and provide a concrete payment-history plan... [not] a partial
// switch that makes reports inconsistent."
//
// The bug this replaces: inv_owner_draws.amount_paid accumulates but
// date_paid is a flat overwrite, so a draw paid $30k in September and $20k
// in October reports the full $50k in October. Each payment here keeps its
// own amount and date, so period-based reporting (monthly/quarterly/annual)
// can bucket correctly instead of dumping everything into the latest date.

export interface DrawPayment {
  id: string;
  draw_id: string;
  amount: number;
  date_received: string; // YYYY-MM-DD
  source: "manual" | "ai";
  idempotency_key: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type NewDrawPayment = Pick<DrawPayment, "draw_id" | "amount" | "date_received" | "source"> & {
  idempotency_key?: string | null;
};

export interface RecordPaymentResult {
  payments: DrawPayment[];
  // The payment actually recorded — or, when idempotency_key matched an
  // existing payment, the pre-existing one that was returned instead of
  // inserting a duplicate.
  payment: DrawPayment;
  wasDuplicate: boolean;
}

// Appends a new payment, unless its idempotency_key matches a live payment
// already on record — the guard markDrawPaidTool lacks today, where two
// identical agent calls would both apply. A null/omitted key never
// dedupes (manual entry has no natural key to compare).
export function recordPayment(
  existing: DrawPayment[],
  newPayment: NewDrawPayment,
  makeId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString()
): RecordPaymentResult {
  if (newPayment.idempotency_key) {
    const duplicate = existing.find(
      (p) => p.deleted_at === null && p.idempotency_key === newPayment.idempotency_key
    );
    if (duplicate) {
      return { payments: existing, payment: duplicate, wasDuplicate: true };
    }
  }

  const payment: DrawPayment = {
    id: makeId(),
    draw_id: newPayment.draw_id,
    amount: newPayment.amount,
    date_received: newPayment.date_received,
    source: newPayment.source,
    idempotency_key: newPayment.idempotency_key ?? null,
    created_at: now(),
    deleted_at: null,
  };
  return { payments: [...existing, payment], payment, wasDuplicate: false };
}

function live(payments: DrawPayment[]): DrawPayment[] {
  return payments.filter((p) => p.deleted_at === null);
}

export function totalPaid(payments: DrawPayment[]): number {
  return Math.round(live(payments).reduce((acc, p) => acc + p.amount, 0) * 100) / 100;
}

// The derived/cached inv_owner_draws.date_paid value under this model: the
// most recent payment's date, kept for backward-compatible display (e.g.
// "last payment date") — never used for period bucketing, which should
// read each payment's own date_received instead (see paymentsByPeriod).
export function lastPaymentDate(payments: DrawPayment[]): string | null {
  const dates = live(payments).map((p) => p.date_received);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

// Buckets each payment into its own period by its own date_received —
// the fix for the "$50,000 reported in October" bug, where today's model
// dumps a draw's entire amount_paid into whichever period its single
// date_paid falls in instead of splitting by when each dollar actually
// arrived.
export function paymentsByPeriod(
  payments: DrawPayment[],
  periodKey: (dateReceived: string) => string
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of live(payments)) {
    const key = periodKey(p.date_received);
    totals.set(key, Math.round(((totals.get(key) ?? 0) + p.amount) * 100) / 100);
  }
  return totals;
}

// days-to-pay, once this model is live, is defined as days to the LAST
// (final-settlement) payment — closest to today's existing meaning ("how
// long until this draw was fully closed out"), not days to the first
// partial payment or a weighted average across installments. Written down
// explicitly here rather than left for a future reader to guess, per the
// request's "document the chosen definition."
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

// For a legacy draw with no payment-history rows (pre-migration), the
// backfill creates exactly one synthetic payment equal to the draw's
// existing amount_paid/date_paid — no invented installment history, per
// the request. This is the backfill's row-shape, used by both the actual
// migration backfill statement and by tests asserting the shape matches.
export function syntheticLegacyPayment(
  drawId: string,
  amountPaid: number,
  datePaid: string | null,
  makeId: () => string = () => crypto.randomUUID()
): DrawPayment | null {
  if (amountPaid <= 0 || !datePaid) return null;
  return {
    id: makeId(),
    draw_id: drawId,
    amount: amountPaid,
    date_received: datePaid,
    source: "manual",
    idempotency_key: null,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
}
