// Pure YTD/QTD billing math — no Supabase import, kept separate from
// lib/data.ts (server-only) the same way lib/aging.ts is, so this stays
// reusable and independently testable.

import { daysOpen } from "@/lib/aging";
import { businessToday, parseLocalDate } from "@/lib/format";
import { billedDate as resolveBilledDate, paidDate as resolvePaidDate } from "@/lib/billingDates";
import { DrawDueType } from "@/lib/types";
import { wasDrawSubmittedOnTime } from "@/lib/drawSchedule";

export interface DrawForBilling {
  project_id: string;
  status: string;
  amount_requested: number | null;
  // Optional: only buildShortPaymentSummary needs it, and most existing
  // callers/tests build DrawForBilling literals without it.
  amount_approved?: number | null;
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

// A project as far as breakdown grouping cares: its cadence (to judge
// on-time submission) plus whatever id the caller wants rows grouped by —
// the project's own id for "By Project", or its developer/lender name for
// those breakdowns instead.
export interface ProjectForBillingGroup {
  id: string;
  draw_due_type: DrawDueType | null;
  draw_due_day: number | null;
}

export interface GroupedBillingRow {
  groupId: string;
  groupName: string;
  requested: number;
  received: number;
  avgDaysToPay: number | null;
  avgDaysToApprove: number | null;
  // Counts only draws whose project has a cadence configured and which
  // were actually submitted (drafts and no-cadence projects contribute to
  // neither number, rather than silently counting as on-time).
  onTimeCount: number;
  lateCount: number;
}

export type ProjectBillingRow = GroupedBillingRow & { projectId: string; projectName: string };

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

export function currentQuarter(now: Date = businessToday()): 1 | 2 | 3 | 4 {
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

// Same billed/received/on-time logic as buildBillingReport, rolled up by
// whatever group `groupOf` resolves each draw's project to — a project's
// own id/name for "By Project", or its developer/lender name for those
// breakdowns, sharing this one accumulation pass either way. Sorted by
// amount billed so the biggest activity for the year surfaces first.
export function buildGroupedBillingBreakdown(
  draws: DrawForBilling[],
  projects: ProjectForBillingGroup[],
  groupOf: (projectId: string) => { id: string; name: string },
  year: number
): GroupedBillingRow[] {
  const cadenceByProject = new Map(projects.map((p) => [p.id, p]));
  const rows = new Map<string, GroupedBillingRow>();
  const daysByGroup = new Map<string, { sum: number; count: number }>();
  const approveDaysByGroup = new Map<string, { sum: number; count: number }>();

  const rowFor = (projectId: string) => {
    const group = groupOf(projectId);
    let row = rows.get(group.id);
    if (!row) {
      row = {
        groupId: group.id,
        groupName: group.name,
        requested: 0,
        received: 0,
        avgDaysToPay: null,
        avgDaysToApprove: null,
        onTimeCount: 0,
        lateCount: 0,
      };
      rows.set(group.id, row);
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
        const groupId = groupOf(d.project_id).id;
        rowFor(d.project_id);
        const sample = daysByGroup.get(groupId) ?? { sum: 0, count: 0 };
        sample.sum += lag;
        sample.count += 1;
        daysByGroup.set(groupId, sample);
      }
    }

    const approveLag = daysToApprove(d);
    if (approveLag !== null) {
      const approved = yearAndQuarterOf(d.date_approved as string);
      if (approved.year === year) {
        const groupId = groupOf(d.project_id).id;
        rowFor(d.project_id);
        const sample = approveDaysByGroup.get(groupId) ?? { sum: 0, count: 0 };
        sample.sum += approveLag;
        sample.count += 1;
        approveDaysByGroup.set(groupId, sample);
      }
    }

    if (d.date_submitted) {
      const submitted = yearAndQuarterOf(d.date_submitted);
      if (submitted.year === year) {
        const cadence = cadenceByProject.get(d.project_id);
        const onTime = cadence ? wasDrawSubmittedOnTime(cadence, d.date_submitted) : null;
        if (onTime !== null) {
          const row = rowFor(d.project_id);
          if (onTime) row.onTimeCount += 1;
          else row.lateCount += 1;
        }
      }
    }
  }

  for (const [groupId, sample] of Array.from(daysByGroup.entries())) {
    const row = rows.get(groupId);
    if (row) row.avgDaysToPay = averageDays(sample.sum, sample.count);
  }
  for (const [groupId, sample] of Array.from(approveDaysByGroup.entries())) {
    const row = rows.get(groupId);
    if (row) row.avgDaysToApprove = averageDays(sample.sum, sample.count);
  }

  return Array.from(rows.values()).sort((a, b) => b.requested - a.requested);
}

const UNKNOWN_PROJECT_NAME = "Unknown project";

// Thin wrapper over buildGroupedBillingBreakdown grouping by the project
// itself — kept as its own name/shape (projectId/projectName) since that's
// what every existing caller (the page, its CSV export, tests) expects.
export function buildProjectBillingBreakdown(
  draws: DrawForBilling[],
  projects: (ProjectForBillingGroup & { name: string })[],
  year: number
): ProjectBillingRow[] {
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const rows = buildGroupedBillingBreakdown(
    draws,
    projects,
    (projectId) => ({ id: projectId, name: nameById.get(projectId) ?? UNKNOWN_PROJECT_NAME }),
    year
  );
  return rows.map((r) => ({ ...r, projectId: r.groupId, projectName: r.groupName }));
}

// Groups by an arbitrary per-project label instead — a developer or lender
// name, defaulting projects with nothing set to `unassignedLabel` rather
// than dropping their billing out of the total.
export function buildLabelBillingBreakdown(
  draws: DrawForBilling[],
  projects: (ProjectForBillingGroup & { label: string | null })[],
  year: number,
  unassignedLabel: string
): GroupedBillingRow[] {
  const labelById = new Map(projects.map((p) => [p.id, p.label ?? unassignedLabel]));
  return buildGroupedBillingBreakdown(
    draws,
    projects,
    (projectId) => {
      const label = labelById.get(projectId) ?? unassignedLabel;
      return { id: label, name: label };
    },
    year
  ).sort((a, b) => {
    if (a.groupName === unassignedLabel) return 1;
    if (b.groupName === unassignedLabel) return -1;
    return b.requested - a.requested;
  });
}

export interface ShortPaymentSummary {
  // Draws actually paid for something other than what was approved —
  // short by even a cent counts, since any gap on a "paid" draw is
  // permanent (unlike a normal pending balance) and easy to miss once the
  // status reads "paid." Positive gap = net underpaid; negative = net
  // overpaid.
  count: number;
  totalGap: number;
}

// Scoped by when each draw was actually paid landing in `year`, same as
// "received" elsewhere on the billing page — a shortfall only becomes real
// once the payment itself happens.
export function buildShortPaymentSummary(draws: DrawForBilling[], year: number): ShortPaymentSummary {
  let count = 0;
  let totalGap = 0;
  for (const d of draws) {
    if (d.status !== "paid" || !d.date_paid) continue;
    const paid = yearAndQuarterOf(d.date_paid);
    if (paid.year !== year) continue;
    const gap = (d.amount_approved ?? d.amount_requested ?? 0) - (d.amount_paid ?? 0);
    if (Math.abs(gap) > 0.01) {
      count += 1;
      totalGap += gap;
    }
  }
  return { count, totalGap };
}
