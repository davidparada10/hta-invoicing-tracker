// What one developer's (or lender's) projects add up to. Shared by the
// assistant's getDeveloperSummary / getLenderSummary tools and the developer
// page, so the two can never show different numbers. It only adds up the
// per-project figures the dashboard already computed; it defines none of its own.

import { openBalance } from "@/lib/data";
import type { OpenDraw, ProjectRollup } from "@/lib/types";
import type { ResidualBalance } from "@/lib/portfolio";

export type GroupField = "developer" | "lender";

const round2 = (n: number) => Math.round(n * 100) / 100;

// invoicedToDate is the amount requested on every submitted, approved or paid
// draw (net of retainage, as on the G702's current payment due); drafts are not
// invoiced yet and are reported separately.
export function buildGroupSummary(
  field: GroupField,
  name: string,
  rollups: ProjectRollup[],
  openDraws: OpenDraw[],
  residuals: ResidualBalance[]
) {
  const rows = rollups.filter((r) => r.project[field] === name);
  const sumOf = (f: (r: ProjectRollup) => number) => round2(rows.reduce((a, r) => a + f(r), 0));
  // totalRequested includes drafts; a draft isn't invoiced until submitted.
  const invoiced = (r: ProjectRollup) => r.totalRequested - r.totalDraft;
  const ids = new Set(rows.map((r) => r.project.id));

  return {
    scope: `${field === "developer" ? "Developer" : "Lender"} ${name}: its projects only, active and closed`,
    [field]: name,
    totals: {
      invoicedToDate: sumOf(invoiced),
      paidToDate: sumOf((r) => r.totalPaidToOwner),
      outstanding: sumOf((r) => r.totalOpenToOwner),
      retainageHeld: sumOf((r) => r.totalDrawRetainage),
      draftsNotYetSubmitted: sumOf((r) => r.totalDraft),
    },
    projects: rows.map((r) => ({
      projectId: r.project.id,
      project: r.project.name,
      status: r.project.status,
      invoicedToDate: round2(invoiced(r)),
      paidToDate: round2(r.totalPaidToOwner),
      outstanding: round2(r.totalOpenToOwner),
      retainageHeld: round2(r.totalDrawRetainage),
      draftsNotYetSubmitted: round2(r.totalDraft),
    })),
    unpaidDraws: openDraws
      .filter((d) => d.status !== "draft" && ids.has(d.project.id))
      .map((d) => ({
        projectId: d.project.id,
        project: d.project.name,
        projectStatus: d.project.status,
        drawNumber: d.draw_number,
        status: d.status,
        amountRequested: d.amount_requested,
        amountPaid: d.amount_paid,
        outstandingBalance: openBalance(d),
        dateSubmitted: d.date_submitted,
      })),
    smallBalancesNotListed: residuals
      .filter((r) => ids.has(r.projectId))
      .map((r) => ({ project: r.projectName, drawNumber: r.drawNumber, balance: r.balance })),
  };
}

export type GroupSummary = ReturnType<typeof buildGroupSummary>;
