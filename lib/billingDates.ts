// Shared date-resolution for "which period does this draw's activity
// belong to" — used by both lib/billing.ts (quarterly/annual reports) and
// lib/monthlyBilling.ts (the dashboard chart), which previously disagreed:
// the chart fell back to period_end before created_at, the report skipped
// straight to created_at. A draw missing date_submitted could land in a
// different month in the chart than in the report for the same amount.
//
// period_end (the billing period the work covers) is deliberately not part
// of this fallback chain — a draw can be submitted well after its own
// period ends, and period_end was never a reliable stand-in for "when did
// this actually get billed/paid." Nothing about a draw's own stored dates
// changes here; this only decides which period a total is bucketed into.

export function billedDate(d: { date_submitted: string | null; created_at: string }): string {
  return d.date_submitted ?? d.created_at;
}

export function paidDate(
  d: { date_paid: string | null; date_submitted: string | null; created_at: string }
): string {
  return d.date_paid ?? billedDate(d);
}
