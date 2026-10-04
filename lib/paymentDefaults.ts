// Pure, client-safe payment-default rules, shared by the draw edit form, the
// Mark Paid action, the status dropdown, and the AI payment tool so they can
// never disagree. (Kept out of lib/data.ts, which pulls in the server-only
// Supabase client.)
//
// The rule: HTA's cash to collect on a draw is what was requested, minus the
// part billed against owner-paid (non-HTA) scope — allocations on budget
// lines flagged excluded_from_contract — minus anything already received.
// Requested $100,000 with $20,000 of owner-paid scope and nothing received
// yet defaults to $80,000.

import type { BudgetLine } from "@/lib/types";

type FlagLine = Pick<BudgetLine, "id" | "excluded_from_contract">;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** IDs of budget lines flagged as owner-paid scope. The one place that flag is read. */
export function excludedLineIdSet(lines: FlagLine[]): Set<string> {
  return new Set(lines.filter((l) => l.excluded_from_contract).map((l) => l.id));
}

/**
 * Owner-paid scope billed on a draw, from amounts keyed by budget line id.
 * Accepts the edit form's unsaved line amounts (strings, possibly blank) as
 * well as saved allocation amounts, so a form preview reflects edits that
 * haven't been saved yet.
 */
export function ownerPaidFromAmounts(
  amountsByLine: Record<string, string | number | null | undefined>,
  lines: FlagLine[]
): number {
  const excluded = excludedLineIdSet(lines);
  let total = 0;
  for (const [lineId, raw] of Object.entries(amountsByLine)) {
    if (!excluded.has(lineId)) continue;
    total += Number(raw) || 0;
  }
  return round2(total);
}

/** Default HTA cash still to receive on a draw; never negative. */
export function defaultCashReceived(args: {
  requested: number;
  ownerPaid: number;
  alreadyReceived: number;
}): number {
  return Math.max(0, round2(args.requested - args.ownerPaid - args.alreadyReceived));
}

export type PaidTransition = {
  /** amount_approved to save: an existing approval is kept; 0 defaults to requested. */
  amountApproved: number;
  /** The receipt to pre-fill, or null when one shouldn't be (already received, or nothing left). */
  pendingPayment: { amount: number } | null;
};

/**
 * What switching a draw to "paid" should do. An existing partial payment is
 * never overwritten or re-defaulted (preexisting receipts stand), and a
 * genuine partial approval stays partial.
 */
export function paidTransition(args: {
  requested: number;
  approved: number;
  alreadyReceived: number;
  ownerPaid: number;
}): PaidTransition {
  const amountApproved = args.approved > 0 ? args.approved : args.requested;
  if (args.alreadyReceived > 0) return { amountApproved, pendingPayment: null };
  const amount = defaultCashReceived(args);
  return { amountApproved, pendingPayment: amount > 0 ? { amount } : null };
}

export type PaymentCheck =
  | { ok: true; overpaidBy: number }
  | { ok: false; overpaidBy: number; error: string };

/**
 * Server-side validation of an EXPLICIT payment amount. A positive amount up
 * to the remaining collectible balance is fine. Anything above it is an
 * overpayment: real data has them (Victoria Draw 7 was paid $4,158.37 over its
 * request), so it's allowed — but only when the caller explicitly confirmed it.
 */
export function checkExplicitPayment(args: {
  amount: number;
  requested: number;
  ownerPaid: number;
  alreadyReceived: number;
  confirmOverpayment: boolean;
}): PaymentCheck {
  if (!(args.amount > 0)) return { ok: false, overpaidBy: 0, error: "Amount received must be greater than zero." };
  const remaining = round2(args.requested - args.ownerPaid - args.alreadyReceived);
  const overpaidBy = Math.max(0, round2(args.amount - Math.max(0, remaining)));
  if (overpaidBy > 0 && !args.confirmOverpayment) {
    return {
      ok: false,
      overpaidBy,
      error: `This is $${overpaidBy.toFixed(2)} more than the $${Math.max(0, remaining).toFixed(
        2
      )} still collectible on this draw. Confirm the overpayment to record it.`,
    };
  }
  return { ok: true, overpaidBy };
}

export type FormPaymentIntent =
  | { mode: "none"; amount: 0; overpaidBy: 0 }
  | { mode: "default" | "explicit"; amount: number; overpaidBy: number };

/**
 * What the draw edit form will ask the server to record on Save, derived live
 * from the form's CURRENT (possibly unsaved) values so the preview tracks
 * allocation edits as they're typed. Until the user types an amount it is the
 * default — recomputed as allocations change — and the server recomputes it
 * from the saved allocations anyway; once they type one it's explicit.
 */
export function formPaymentIntent(args: {
  active: boolean;
  /** The amount the user typed, or null if they haven't touched it. */
  override: string | null;
  requested: number;
  ownerPaid: number;
  alreadyReceived: number;
}): FormPaymentIntent {
  if (!args.active) return { mode: "none", amount: 0, overpaidBy: 0 };
  const remaining = round2(args.requested - args.ownerPaid - args.alreadyReceived);
  if (args.override === null) {
    return { mode: "default", amount: defaultCashReceived(args), overpaidBy: 0 };
  }
  const amount = Number(args.override) || 0;
  return { mode: "explicit", amount, overpaidBy: Math.max(0, round2(amount - Math.max(0, remaining))) };
}
