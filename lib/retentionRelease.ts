// Pure logic for the draw form's "Release retention" mode — split out of
// components/DrawFormModal.tsx so it's unit-tested, same pattern as
// lib/monthlyBilling.ts and lib/projectSummary.ts.

import { OwnerDraw } from "@/lib/types";

export interface RetentionRelease {
  // Retention held across every other POSTED draw on this project — the
  // balance this draw would release in full.
  retentionHeldToDate: number;
  // What to actually write into retainage_held for a release. Zero (not a
  // positive number) when retentionHeldToDate is already negative — see
  // isInconsistent.
  releaseAmount: number;
  // True when prior draws already sum to negative retainage (an earlier
  // release over-released, or the underlying data is otherwise off). In
  // that state, releasing again must not silently manufacture a new
  // positive withholding just because -retentionHeldToDate would be
  // positive — the inconsistency needs to be looked at, not compounded.
  isInconsistent: boolean;
}

type ReleaseDraw = Pick<OwnerDraw, "id" | "status" | "retainage_held">;

// Retention held on every other POSTED draw of this project — the balance
// this draw would release in full, since each draw's own retainage_held is
// an incremental amount (added this period) rather than a running total. A
// draft is excluded: nothing on an unsubmitted draft has actually been
// withheld yet, so it shouldn't move how much a real release pays out. A
// prior release (a draw with negative retainage_held) is still included —
// summing naturally nets it out, which is exactly what prevents the same
// retention from being released twice.
export function computeRetentionRelease(draws: ReleaseDraw[], editingId?: string): RetentionRelease {
  const total = draws
    .filter((d) => d.id !== editingId && d.status !== "draft")
    .reduce((acc, d) => acc + (d.retainage_held ?? 0), 0);
  const retentionHeldToDate = Math.round(total * 100) / 100;

  const isInconsistent = retentionHeldToDate < 0;
  // `|| 0` normalizes a -0 result (retentionHeldToDate exactly 0) to a
  // plain 0, since -0 is a legitimate but confusing distinct value here.
  const releaseAmount = isInconsistent ? 0 : -retentionHeldToDate || 0;

  return { retentionHeldToDate, releaseAmount, isInconsistent };
}

// A per-draw retainage_held is supposed to be incremental (this period's
// own withholding), but the G702's "Total Retainage" cell it's parsed from
// is, per the AIA form standard, normally cumulative-to-date — an
// ambiguity real enough that an earlier session spent real effort tracing
// it out for one project (see DEVLOG.md). Rather than guess at parse time,
// this is a loose plausibility check on the parsed value: normal retention
// is 0/5/10% of a draw's own billing, so anything holding back more than a
// quarter of what was requested is far more likely to be a cumulative
// total that landed in the wrong field than a real single-draw withholding.
// Advisory only — never blocks a save, never rewrites the value.
export function isImplausibleRetainage(retainageHeld: number, amountRequested: number): boolean {
  if (amountRequested <= 0) return false;
  return retainageHeld > amountRequested * 0.25;
}
