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

type ConversionDraw = Pick<OwnerDraw, "id" | "status" | "retainage_held" | "draw_number"> & {
  deleted_at?: string | null;
};

export type CumulativeConversion =
  | {
      status: "ok";
      // Retention already held by the draws that PRECEDE the target.
      priorHeld: number;
      // This draw's own retainage: parsedCumulative − priorHeld. Negative
      // when the document's cumulative figure fell below what was held
      // before it — a partial release. Never clamped.
      incremental: number;
      isDecrease: boolean;
    }
  | { status: "unavailable"; reason: string };

// A parsed G702's "Total Retainage" cell is normally cumulative-to-date.
// When the user confirms that reading, this draw's own (incremental)
// retainage is the cumulative figure minus what the draws BEFORE it already
// held — not the whole project's balance, which would wrongly include later
// draws when an older draw is edited.
//
// Ordering rule: draw_number is the app's only real sequence key — it's what
// getDrawsForProject sorts by, what the duplicate-number constraint
// protects, and what users see ("Draw #2"). period_end / date_submitted are
// nullable or user-entered and created_at is insertion time, so none of them
// reliably tracks billing order (draws can be entered out of order). A draw
// precedes the target only if its draw_number is STRICTLY LESS; gaps are fine
// (e.g. draws 1-11 and 13), and an equal number is ambiguous rather than
// something to break by date.
//
// Counted: live (not deleted), non-draft draws other than the one being
// edited, with earlier releases included at their negative sign. If the
// target's own number is missing/invalid, collides with another live draw,
// or any live posted draw has no usable number, the result is "unavailable"
// so the form can ask instead of guessing.
export function convertCumulativeRetention(args: {
  draws: ConversionDraw[];
  editingId?: string;
  targetDrawNumber: number | null;
  parsedCumulative: number;
}): CumulativeConversion {
  const { draws, editingId, targetDrawNumber, parsedCumulative } = args;

  if (
    targetDrawNumber === null ||
    !Number.isFinite(targetDrawNumber) ||
    !Number.isInteger(targetDrawNumber) ||
    targetDrawNumber <= 0
  ) {
    return { status: "unavailable", reason: "Enter this draw's number first — retention is converted relative to the draws before it." };
  }

  const live = draws.filter((d) => !d.deleted_at);

  if (live.some((d) => d.id !== editingId && d.draw_number === targetDrawNumber)) {
    return { status: "unavailable", reason: `Draw #${targetDrawNumber} already exists on this project, so its place in the sequence is ambiguous.` };
  }

  const others = live.filter((d) => d.id !== editingId && d.status !== "draft");

  if (others.some((d) => !Number.isFinite(d.draw_number))) {
    return { status: "unavailable", reason: "A posted draw on this project has no usable draw number, so the sequence can't be determined." };
  }

  const numbers = new Set<number>();
  for (const d of live.filter((x) => x.status !== "draft")) {
    if (numbers.has(d.draw_number)) {
      return { status: "unavailable", reason: `Draw #${d.draw_number} appears more than once on this project, so the sequence is ambiguous.` };
    }
    numbers.add(d.draw_number);
  }

  const priorHeld =
    Math.round(
      others.filter((d) => d.draw_number < targetDrawNumber).reduce((acc, d) => acc + (d.retainage_held ?? 0), 0) * 100
    ) / 100;
  const incremental = Math.round((parsedCumulative - priorHeld) * 100) / 100;

  return { status: "ok", priorHeld, incremental, isDecrease: incremental < 0 };
}

type RateInferenceDraw = Pick<OwnerDraw, "id" | "status" | "amount_requested" | "retainage_held">;

// The rate this project has actually been withholding, inferred from its
// own posted history rather than trusted from a possibly-cumulative G702
// cell. amount_requested is net of retention (see the allocation-mismatch
// comment in DrawFormModal.tsx), so the implied rate for a draw is
// retainage / (requested + retainage). Only returns a rate when every
// candidate draw agrees (within a point) on the same standard bucket —
// disagreement, or no usable history, means "don't guess."
export function inferRetentionRate(
  draws: RateInferenceDraw[],
  editingId?: string
): "0" | "5" | "10" | null {
  const RATES = ["0", "5", "10"] as const;
  const TOLERANCE = 1;

  const impliedRates = draws
    .filter(
      (d) =>
        d.id !== editingId &&
        d.status !== "draft" &&
        (d.amount_requested ?? 0) > 0 &&
        (d.retainage_held ?? 0) > 0
    )
    .map((d) => (d.retainage_held / (d.amount_requested + d.retainage_held)) * 100);

  if (impliedRates.length === 0) return null;

  const matchedBuckets = new Set<(typeof RATES)[number]>();
  for (const implied of impliedRates) {
    const bucket = RATES.find((r) => Math.abs(implied - Number(r)) <= TOLERANCE);
    if (!bucket) return null;
    matchedBuckets.add(bucket);
  }

  return matchedBuckets.size === 1 ? [...matchedBuckets][0] : null;
}
