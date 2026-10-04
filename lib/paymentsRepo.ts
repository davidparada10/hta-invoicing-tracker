// The only place payment receipts are written. Every write is one
// supabase.rpc() call into a Postgres function (see
// supabase/migrations/20261001120000_add_draw_payments.sql) that changes the
// receipt AND refreshes the draw's cached amount_paid/date_paid in a single
// transaction — Supabase's JS client has no multi-statement transactions, so a
// function is the only way to keep the two from drifting apart.

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DrawPayment } from "@/lib/paymentHistory";

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
  }
): Promise<PaymentWriteResult> {
  return call(supabase, "record_draw_payment", {
    p_draw_id: input.drawId,
    p_amount: input.amount,
    p_date: input.date,
    p_source: input.source,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_set_paid: input.setPaid ?? false,
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
