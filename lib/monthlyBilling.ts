// Pure month-bucketing logic for the dashboard's Monthly Billing chart —
// split out of components/MonthlyBillingChart.tsx so it's unit-tested,
// same pattern as lib/drawAllocations.ts.

import { OwnerDraw } from "@/lib/types";
import { billedDate, paidDate } from "@/lib/billingDates";

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
  "status" | "amount_requested" | "amount_paid" | "excluded_allocated" | "date_submitted" | "date_paid" | "created_at"
>;

// Drafts haven't actually been billed yet — including them would show
// "invoiced" money that was never really requested. Invoiced amounts are
// grouped by when the invoice was actually submitted, paid amounts by when
// the cash actually came in (see lib/billingDates.ts for the shared
// fallback rules — the same ones lib/billing.ts's quarterly/annual report
// uses, so a draw lands in the same period in both places). Owner-paid,
// non-HTA scope (excluded_allocated) is netted out of invoiced, matching
// every other "billed" figure in the app.
export function buildMonthlyBillingBuckets(draws: ChartDraw[]): MonthBucket[] {
  const byMonth = new Map<string, MonthBucket>();

  for (const d of draws) {
    if (d.status === "draft") continue;

    const invoicedNet = (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0);
    if (invoicedNet !== 0) {
      getBucket(byMonth, monthKey(billedDate(d))).invoiced += invoicedNet;
    }

    const paid = d.amount_paid ?? 0;
    if (paid !== 0) {
      getBucket(byMonth, monthKey(paidDate(d))).paid += paid;
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
