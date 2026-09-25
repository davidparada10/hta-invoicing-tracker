// Pure YTD/QTD billing math — no Supabase import, kept separate from
// lib/data.ts (server-only) the same way lib/aging.ts is, so this stays
// reusable and independently testable.

import { daysOpen } from "@/lib/aging";
import { parseLocalDate } from "@/lib/format";
import { billedDate as resolveBilledDate, paidDate as resolvePaidDate } from "@/lib/billingDates";

export interface DrawForBilling {
  project_id: string;
  status: string;
  amount_requested: number | null;
  amount_paid: number | null;
  date_submitted: string | null;
  date_approved: string | null;
  date_paid: string | null;
  created_at: string;
  // See lib/data.ts openBalance()/excludedAllocationByDraw() — billing
  // against an excluded_from_contract line was never real HTA billing, so
  // it's netted out of "requested" here too, the same way it's netted out
  // of "outstanding" everywhere else.
  excluded_allocated?: number;
}

export interface ProjectBillingRow {
  projectId: string;
  projectName: string;
  requested: number;
  received: number;
  avgDaysToPay: number | null;
  avgDaysToApprove: number | null;
}

export interface QuarterBucket {
  quarter: 1 | 2 | 3 | 4;
  requested: number;
  received: number;
  avgDaysToPay: number | null;
  avgDaysToApprove: number | null;
}

export interface BillingReport {
  year: number;
  ytdRequested: number;
  ytdReceived: number;
  ytdAvgDaysToPay: number | null;
  ytdAvgDaysToApprove: number | null;
  quarters: QuarterBucket[];
}

function yearAndQuarterOf(dateISO: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const d = parseLocalDate(dateISO);
  return { year: d.getFullYear(), quarter: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 };
}

export function currentQuarter(now: Date = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

function averageDays(sum: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round(sum / count);
}

// Days from billed (submitted, else created) to paid. Only defined when a
// real date_paid is on the draw — unpaid draws and paid-without-a-date are
// excluded so a missing date doesn't read as "paid in 0 days".
function daysToPay(d: DrawForBilling): number | null {
  if (!d.date_paid) return null;
  return daysOpen(d.date_submitted ?? d.created_at, parseLocalDate(d.date_paid));
}

// Days from submitted to approved — the owner/lender's own turnaround, as
// opposed to daysToPay's full submit-to-cash lag. Only defined once a real
// date_approved is on the draw; a draw that skipped approval (e.g. marked
// paid directly from submitted) contributes nothing rather than reading as
// instant.
function daysToApprove(d: DrawForBilling): number | null {
  if (!d.date_approved) return null;
  return daysOpen(d.date_submitted ?? d.created_at, parseLocalDate(d.date_approved));
}

// "Requested" is bucketed by when a draw was submitted (billed); "received"
// by when it was actually paid — a draw billed in one quarter can be paid in
// a later one, which is the point of showing both columns side by side.
// Draws marked paid without a recorded date_paid fall back to their
// submission date rather than being silently dropped from the total.
export function buildBillingReport(draws: DrawForBilling[], year: number): BillingReport {
  const quarters: QuarterBucket[] = [1, 2, 3, 4].map((quarter) => ({
    quarter: quarter as 1 | 2 | 3 | 4,
    requested: 0,
    received: 0,
    avgDaysToPay: null,
    avgDaysToApprove: null,
  }));
  const daysByQuarter = [1, 2, 3, 4].map(() => ({ sum: 0, count: 0 }));
  const approveDaysByQuarter = [1, 2, 3, 4].map(() => ({ sum: 0, count: 0 }));
  let ytdDaysSum = 0;
  let ytdDaysCount = 0;
  let ytdApproveDaysSum = 0;
  let ytdApproveDaysCount = 0;

  for (const d of draws) {
    if (d.status === "draft") continue;

    const requestedDate = resolveBilledDate(d);
    const requested = yearAndQuarterOf(requestedDate);
    if (requested.year === year) {
      quarters[requested.quarter - 1].requested += (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0);
    }

    const amountPaid = d.amount_paid ?? 0;
    if (amountPaid > 0) {
      const received = yearAndQuarterOf(resolvePaidDate(d));
      if (received.year === year) {
        quarters[received.quarter - 1].received += amountPaid;
      }
    }

    const lag = daysToPay(d);
    if (lag !== null) {
      const paid = yearAndQuarterOf(d.date_paid as string);
      if (paid.year === year) {
        daysByQuarter[paid.quarter - 1].sum += lag;
        daysByQuarter[paid.quarter - 1].count += 1;
        ytdDaysSum += lag;
        ytdDaysCount += 1;
      }
    }

    const approveLag = daysToApprove(d);
    if (approveLag !== null) {
      const approved = yearAndQuarterOf(d.date_approved as string);
      if (approved.year === year) {
        approveDaysByQuarter[approved.quarter - 1].sum += approveLag;
        approveDaysByQuarter[approved.quarter - 1].count += 1;
        ytdApproveDaysSum += approveLag;
        ytdApproveDaysCount += 1;
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    quarters[i].avgDaysToPay = averageDays(daysByQuarter[i].sum, daysByQuarter[i].count);
    quarters[i].avgDaysToApprove = averageDays(approveDaysByQuarter[i].sum, approveDaysByQuarter[i].count);
  }

  return {
    year,
    ytdRequested: quarters.reduce((acc, q) => acc + q.requested, 0),
    ytdReceived: quarters.reduce((acc, q) => acc + q.received, 0),
    ytdAvgDaysToPay: averageDays(ytdDaysSum, ytdDaysCount),
    ytdAvgDaysToApprove: averageDays(ytdApproveDaysSum, ytdApproveDaysCount),
    quarters,
  };
}

// Same billed/received logic as buildBillingReport, rolled up per project
// instead of per quarter — sorted by amount billed so the biggest activity
// for the year surfaces first.
export function buildProjectBillingBreakdown(
  draws: DrawForBilling[],
  projects: { id: string; name: string }[],
  year: number
): ProjectBillingRow[] {
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const rows = new Map<string, ProjectBillingRow>();
  const daysByProject = new Map<string, { sum: number; count: number }>();
  const approveDaysByProject = new Map<string, { sum: number; count: number }>();

  const rowFor = (projectId: string) => {
    let row = rows.get(projectId);
    if (!row) {
      row = {
        projectId,
        projectName: nameById.get(projectId) ?? "Unknown project",
        requested: 0,
        received: 0,
        avgDaysToPay: null,
        avgDaysToApprove: null,
      };
      rows.set(projectId, row);
    }
    return row;
  };

  for (const d of draws) {
    if (d.status === "draft") continue;

    const requestedDate = resolveBilledDate(d);
    const requested = yearAndQuarterOf(requestedDate);
    if (requested.year === year) {
      rowFor(d.project_id).requested += (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0);
    }

    const amountPaid = d.amount_paid ?? 0;
    if (amountPaid > 0) {
      const received = yearAndQuarterOf(resolvePaidDate(d));
      if (received.year === year) {
        rowFor(d.project_id).received += amountPaid;
      }
    }

    const lag = daysToPay(d);
    if (lag !== null) {
      const paid = yearAndQuarterOf(d.date_paid as string);
      if (paid.year === year) {
        rowFor(d.project_id);
        const sample = daysByProject.get(d.project_id) ?? { sum: 0, count: 0 };
        sample.sum += lag;
        sample.count += 1;
        daysByProject.set(d.project_id, sample);
      }
    }

    const approveLag = daysToApprove(d);
    if (approveLag !== null) {
      const approved = yearAndQuarterOf(d.date_approved as string);
      if (approved.year === year) {
        rowFor(d.project_id);
        const sample = approveDaysByProject.get(d.project_id) ?? { sum: 0, count: 0 };
        sample.sum += approveLag;
        sample.count += 1;
        approveDaysByProject.set(d.project_id, sample);
      }
    }
  }

  for (const [projectId, sample] of Array.from(daysByProject.entries())) {
    const row = rows.get(projectId);
    if (row) row.avgDaysToPay = averageDays(sample.sum, sample.count);
  }
  for (const [projectId, sample] of Array.from(approveDaysByProject.entries())) {
    const row = rows.get(projectId);
    if (row) row.avgDaysToApprove = averageDays(sample.sum, sample.count);
  }

  return Array.from(rows.values()).sort((a, b) => b.requested - a.requested);
}
