// Pure aggregation logic for the project detail page's summary card — split
// out of components/ProjectSummaryCard.tsx so it's unit-tested, same
// pattern as lib/drawAllocations.ts and lib/monthlyBilling.ts.

import { OwnerDraw } from "@/lib/types";
import { hasMeaningfulOpenBalance, openBalance } from "@/lib/data";

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

export interface ProjectSummary {
  totalRequested: number;
  totalPaidToOwner: number;
  totalOpenToOwner: number;
  retainageHeld: number;
  hasMeaningfulOpenBalance: boolean;
  paidPct: number;
}

// A draft hasn't actually been billed — including it would count money
// that was never really requested, or retainage that was never actually
// withheld. Owner-paid, non-HTA scope is netted out of "requested" the
// same way it's netted out of everything else (openBalance, the billing
// report), so this matches what's actually HTA's own billed total.
export function computeProjectSummary(draws: OwnerDraw[]): ProjectSummary {
  const nonDraftDraws = draws.filter((d) => d.status !== "draft");
  const totalRequested = sum(
    nonDraftDraws.map((d) => (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0))
  );
  const totalPaidToOwner = sum(nonDraftDraws.map((d) => d.amount_paid));
  // openBalance() floors each draw's balance at zero before this sums
  // them, so an overpayment on one draw can never offset (and hide) an
  // unpaid balance on another.
  const totalOpenToOwner = sum(draws.map(openBalance));
  const retainageHeld = sum(nonDraftDraws.map((d) => d.retainage_held));

  // Settled progress caps each draw's own contribution at what it was
  // actually billed for — an overpayment on one draw (e.g. $150k paid on
  // a $100k draw) can't count toward paying off a completely different,
  // still-unpaid draw just because the raw totals happen to net out.
  const settled = sum(
    nonDraftDraws.map((d) =>
      Math.min((d.amount_requested ?? 0) - (d.excluded_allocated ?? 0), d.amount_paid ?? 0)
    )
  );
  const paidPctRaw = totalRequested > 0 ? Math.min(100, (settled / totalRequested) * 100) : 0;
  // Round down short of 100% so the label can't claim "100%" while a balance is still open.
  const paidPct = paidPctRaw >= 100 ? 100 : Math.floor(paidPctRaw);

  return {
    totalRequested,
    totalPaidToOwner,
    totalOpenToOwner,
    retainageHeld,
    hasMeaningfulOpenBalance: hasMeaningfulOpenBalance(draws),
    paidPct,
  };
}
