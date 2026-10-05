// The only place payment receipts are written. Every write is one
// supabase.rpc() call into a Postgres function (see
// supabase/migrations/20261001120000_add_draw_payments.sql) that changes the
// receipt AND refreshes the draw's cached amount_paid/date_paid in a single
// transaction — Supabase's JS client has no multi-statement transactions, so a
// function is the only way to keep the two from drifting apart.

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DrawPayment } from "@/lib/paymentHistory";
import { formatCurrency, formatDate } from "@/lib/format";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

export interface PaymentWriteResult {
  payment: DrawPayment | null;
  /** True when the idempotency key matched an earlier receipt, so nothing new was recorded. */
  wasDuplicate: boolean;
  /** The draw's cached totals after the call. */
  amountPaid: number;
  datePaid: string | null;
}

type RpcError = { code?: string; message?: string };

// Turns a database error into a message a person can act on. Raw Postgres text
// never reaches the UI (Next.js strips thrown Server Action messages in
// production anyway, so callers return these as { error }).
export function describePaymentError(err: RpcError): string {
  const msg = err.message ?? "";
  if (err.code === "42883" || err.code === "PGRST202" || /could not find the function/i.test(msg)) {
    return "Payment history isn't set up on this database yet — the payment-history migration hasn't been applied.";
  }
  if (err.code === "P0002") {
    return msg.includes("payment") ? "That payment no longer exists." : "This draw no longer exists or has been deleted.";
  }
  if (err.code === "P0001" && /drift/i.test(msg)) {
    return "This draw's received total doesn't match its recorded payments, so nothing was saved. Reconcile the draw's payments first.";
  }
  if (err.code === "P0003") {
    return "This payment request was already used for a different payment. Refresh the draw and try again.";
  }
  if (err.code === "22023") return msg;
  return "Could not record the payment. Please try again.";
}

type RpcRow = {
  payment?: DrawPayment | null;
  was_duplicate?: boolean;
  was_noop?: boolean;
  amount_paid: number | string;
  date_paid: string | null;
};

function toResult(row: RpcRow): PaymentWriteResult {
  return {
    payment: row.payment ?? null,
    wasDuplicate: Boolean(row.was_duplicate ?? row.was_noop),
    amountPaid: Number(row.amount_paid) || 0,
    datePaid: row.date_paid ?? null,
  };
}

async function call(supabase: Supabase, fn: string, args: Record<string, unknown>): Promise<PaymentWriteResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(describePaymentError(error));
  return toResult(data as RpcRow);
}

export function recordDrawPayment(
  supabase: Supabase,
  input: {
    drawId: string;
    amount: number;
    date: string;
    source: "manual" | "ai";
    idempotencyKey?: string | null;
    /** Also mark the draw paid (and default a missing approved amount). */
    setPaid?: boolean;
    /**
     * Whether the caller chose the amount / date (true) or they were derived
     * (the remaining balance, today). Only explicit values are compared when the
     * key matches an earlier receipt: a derived amount legitimately differs on a
     * retry because the first attempt already changed the balance.
     */
    amountExplicit?: boolean;
    dateExplicit?: boolean;
  }
): Promise<PaymentWriteResult> {
  return call(supabase, "record_draw_payment", {
    p_draw_id: input.drawId,
    p_amount: input.amount,
    p_date: input.date,
    p_source: input.source,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_set_paid: input.setPaid ?? false,
    p_amount_explicit: input.amountExplicit ?? false,
    p_date_explicit: input.dateExplicit ?? false,
  });
}

export function voidDrawPayment(
  supabase: Supabase,
  input: { paymentId: string; drawId: string }
): Promise<PaymentWriteResult> {
  return call(supabase, "void_draw_payment", { p_payment_id: input.paymentId, p_draw_id: input.drawId });
}

export function correctDrawPayment(
  supabase: Supabase,
  input: { paymentId: string; drawId: string; amount: number; date: string; idempotencyKey?: string | null }
): Promise<PaymentWriteResult> {
  return call(supabase, "correct_draw_payment", {
    p_payment_id: input.paymentId,
    p_draw_id: input.drawId,
    p_new_amount: input.amount,
    p_new_date: input.date,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
}

// ---- Retries ---------------------------------------------------------------
//
// Server actions look for an earlier receipt under the same idempotency key
// BEFORE judging the request against the draw's current balance — otherwise a
// retry of a payment that already cleared the balance is rejected for "no
// outstanding balance" (or as an overpayment) because of the very payment it
// is repeating. This lookup is only a courtesy so the retry returns the
// original result; the database function remains the guard against concurrent
// duplicates and key reuse (it locks the draw, then checks the key).

export type PriorPayment =
  | { kind: "none" }
  | { kind: "replay"; payment: DrawPayment }
  | { kind: "error"; error: string };

export async function findPaymentByKey(
  supabase: Supabase,
  drawId: string,
  idempotencyKey: string | null | undefined
): Promise<DrawPayment | null> {
  if (!idempotencyKey) return null;
  const { data, error } = await supabase
    .from("inv_draw_payments")
    .select("*")
    .eq("draw_id", drawId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  // A lookup failure (including a missing table before the migration) just
  // means "no known earlier receipt"; the write itself reports real problems.
  if (error || !data) return null;
  return data as DrawPayment;
}

/**
 * Classifies a request against any receipt already recorded under its key.
 * `explicit` carries only the values the caller actually chose; a derived
 * amount or "today" date is never compared. A voided receipt is never revived.
 */
export async function checkPriorPayment(
  supabase: Supabase,
  drawId: string,
  idempotencyKey: string | null | undefined,
  explicit: { amount?: number; date?: string } = {}
): Promise<PriorPayment> {
  const prior = await findPaymentByKey(supabase, drawId, idempotencyKey);
  if (!prior) return { kind: "none" };

  const amountDiffers =
    explicit.amount !== undefined && Math.round(explicit.amount * 100) !== Math.round(Number(prior.amount) * 100);
  const dateDiffers = explicit.date !== undefined && explicit.date !== prior.date_received;
  if (amountDiffers || dateDiffers) {
    return {
      kind: "error",
      error: `This payment request was already used for ${formatCurrency(Number(prior.amount))} received ${formatDate(prior.date_received)}, so a different amount or date wasn't recorded. Refresh the draw and try again.`,
    };
  }
  if (prior.deleted_at) {
    return {
      kind: "error",
      error: `That ${formatCurrency(Number(prior.amount))} payment was already recorded and has since been voided, so it wasn't applied again. Record a new payment if it's still owed.`,
    };
  }
  return { kind: "replay", payment: prior };
}
