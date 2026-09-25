// Pure month-bucketing logic for the dashboard's Monthly Billing chart —
// split out of components/MonthlyBillingChart.tsx so it's unit-tested,
// same pattern as lib/drawAllocations.ts.

import { OwnerDraw } from "@/lib/types";

export interface MonthBucket {
  key: string;
  label: string;
  invoiced: number;
  paid: number;
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function getBucket(byMonth: Map<string, MonthBucket>, key: string): MonthBucket {
  const bucket = byMonth.get(key) ?? { key, label: monthLabel(key), invoiced: 0, paid: 0 };
  byMonth.set(key, bucket);
  return bucket;
}

type ChartDraw = Pick<
  OwnerDraw,
  "status" | "amount_requested" | "amount_paid" | "excluded_allocated" | "date_submitted" | "date_paid" | "period_end" | "created_at"
>;

// Drafts haven't actually been billed yet — including them would show
// "invoiced" money that was never really requested. Invoiced amounts are
// grouped by when the invoice was actually submitted (falling back to the
// billing period, then created_at, for a draw with no submission date
// yet); paid amounts by when the cash actually came in — the two can land
// in different months (a draw submitted in August but paid in September),
// and lumping them into one date understated one side or the other.
// Owner-paid, non-HTA scope (excluded_allocated) is netted out of
// invoiced, matching every other "billed" figure in the app.
export function buildMonthlyBillingBuckets(draws: ChartDraw[]): MonthBucket[] {
  const byMonth = new Map<string, MonthBucket>();

  for (const d of draws) {
    if (d.status === "draft") continue;

    const invoicedNet = (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0);
    const invoicedDate = d.date_submitted ?? d.period_end ?? d.created_at;
    if (invoicedDate && invoicedNet !== 0) {
      getBucket(byMonth, monthKey(invoicedDate)).invoiced += invoicedNet;
    }

    const paid = d.amount_paid ?? 0;
    const paidDate = d.date_paid ?? d.date_submitted ?? d.period_end ?? d.created_at;
    if (paidDate && paid !== 0) {
      getBucket(byMonth, monthKey(paidDate)).paid += paid;
    }
  }

  return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
