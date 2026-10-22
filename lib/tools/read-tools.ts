import { tool } from "ai";
import { z } from "zod";
import {
  contractValue,
  excludedAllocationByDraw,
  getAllocationsForProject,
  getDashboardData,
  getOpenDraws,
  getDrawsForProject,
  getBudgetLinesForProject,
  getAllDraws,
  getLivePayments,
  getPaymentsForProject,
  getProjects,
  getBillingReport,
  getProjectBillingBreakdown,
  getDeveloperBillingBreakdown,
  getLenderBillingBreakdown,
  getMonthlyBilling,
  openBalance,
} from "@/lib/data";
import { AGING_BUCKETS, agingBucket, daysOpen } from "@/lib/aging";
import { businessToday, businessTodayISO, parseLocalDate } from "@/lib/format";
import { paymentsForDraws } from "@/lib/paymentHistory";
import { outstandingAcrossAll, scopeTotals } from "@/lib/portfolio";
import { matchGroup, resolveProject, type GroupField } from "./shared";
import { buildGroupSummary } from "@/lib/groupSummary";
import { OwnerDraw } from "@/lib/types";

// Time from submitted to approved — a fixed fact once approved, a live
// running count while a draw still awaits it (mirrors
// components/DrawsSection.tsx's approvalLabel). null if not applicable:
// never submitted, or skipped approval entirely (e.g. marked paid directly
// from submitted).
function daysToApprove(draw: OwnerDraw): number | null {
  if (!draw.date_submitted) return null;
  if (draw.date_approved) {
    return daysOpen(draw.date_submitted, parseLocalDate(draw.date_approved));
  }
  return draw.status === "submitted" ? daysOpen(draw.date_submitted) : null;
}

// Optional developer / lender filters shared by the read tools. `include` says
// whether a project is in scope; `label` states the scope in the result. A
// name that matches nothing is an error that lists the real ones, never a
// silent fall-back to "everything".
const SCOPE_INPUT = {
  developer: z
    .string()
    .optional()
    .describe("Limit to one developer's projects (e.g. 'HVN'). Omit for every developer."),
  lender: z
    .string()
    .optional()
    .describe("Limit to one lender's projects. Omit for every lender."),
};

type Scopable = { developer: string | null; lender: string | null };

function projectScope(
  filters: { developer?: string; lender?: string },
  projects: Scopable[]
): { include: (p: Scopable) => boolean; label: string; ids: <T extends { id: string } & Scopable>(ps: T[]) => Set<string> } | { error: string } {
  const picked: { field: GroupField; name: string }[] = [];
  for (const field of ["developer", "lender"] as const) {
    const value = filters[field];
    if (!value || !value.trim()) continue;
    const m = matchGroup(field, value, projects);
    if ("error" in m) return { error: m.error };
    picked.push({ field, name: m.name });
  }
  const include = (p: Scopable) => picked.every((f) => p[f.field] === f.name);
  return {
    include,
    label: picked.length
      ? `${picked.map((f) => `${f.field === "developer" ? "Developer" : "Lender"} ${f.name}`).join(" and ")}: matching projects only, active and closed`
      : "All projects, active and closed",
    ids: (ps) => new Set(ps.filter(include).map((p) => p.id)),
  };
}

export const listProjectsTool = tool({
  description:
    "List every project (active AND closed) with its paid-to-owner, currently-invoiced (open), contract value, and retainage totals. `totals` covers ALL projects; `activeTotals` covers only active ones (what the dashboard's Active view shows). A closed project is NOT necessarily fully paid — check its own open balance. Use this for portfolio-wide questions or to find/confirm a project's exact name; for 'what is still owed' prefer getOutstandingSummary.",
  inputSchema: z.object({}),
  execute: async () => {
    const { rollups, totals } = await getDashboardData();
    const active = scopeTotals(rollups, "active");
    return {
      scope: "All projects, active and closed",
      totals,
      activeTotals: {
        scope: "Active projects only",
        projectCount: active.projectCount,
        totalBudget: active.totalBudget,
        totalPaidToOwner: active.totalPaidToOwner,
        totalRetainage: active.totalRetainage,
        totalDraft: active.totalDraft,
        balanceToComplete: active.balanceToComplete,
      },
      closedProjectCount: rollups.length - active.projectCount,
      projects: rollups.map((r) => ({
        name: r.project.name,
        developer: r.project.developer,
        lender: r.project.lender,
        address: r.project.address,
        status: r.project.status,
        totalPaidToOwner: r.totalPaidToOwner,
        totalOpenToOwner: r.totalOpenToOwner,
        totalBudget: r.totalBudget,
        balanceToComplete: r.balanceToComplete,
        totalRetainage: r.totalDrawRetainage,
      })),
    };
  },
});

export const getOpenDrawsTool = tool({
  description:
    "List owner draws across every project — active AND closed — that still have a balance owed (amount requested minus amount actually paid), oldest first — including a draw marked 'paid' for less than it requested. Each draw says whether its project is closed (a closed project can still be owed money). Balances of $1,000 or less are not listed here; getOutstandingSummary lists them. This is the 'what's still unpaid' view; it is NOT total invoiced to date (use getDeveloperSummary for what a developer has invoiced). Pass `developer` and/or `lender` to limit to their projects.",
  inputSchema: z.object(SCOPE_INPUT),
  execute: async ({ developer, lender }) => {
    // Resolve the name against every project, not just ones with open draws, so
    // a developer or lender with nothing owed answers "nothing" instead of
    // "not found".
    const [all, projects] = await Promise.all([getOpenDraws(), getProjects()]);
    const scoped = projectScope({ developer, lender }, projects);
    if ("error" in scoped) return { error: scoped.error };
    const draws = all.filter((d) => scoped.include(d.project));
    return draws.map((d) => ({
      project: d.project.name,
      developer: d.project.developer,
      lender: d.project.lender,
      projectStatus: d.project.status,
      drawNumber: d.draw_number,
      status: d.status,
      amountRequested: d.amount_requested,
      amountPaid: d.amount_paid,
      outstandingBalance: openBalance(d),
      dateSubmitted: d.date_submitted,
      notes: d.notes,
    }));
  },
});

export const getRecentPaymentsTool = tool({
  description:
    "List payments (receipts) received, across all projects, in one call — use this for 'what got paid today/yesterday/on <date>' and also for periods like 'this week', 'last 7 days' or 'since the 1st' instead of checking each project individually. Pass `date` for one day (defaults to today's server date), or `startDate` and/or `endDate` (inclusive, YYYY-MM-DD) for a period; a period result also gives totalReceived and a per-project total. Each draw's payments are tracked separately with their own date, so a draw paid in two installments shows up on both dates with just that day's amount. Pass `developer` and/or `lender` to limit to their projects.",
  inputSchema: z.object({
    date: z
      .string()
      .optional()
      .describe(
        "A single date, as YYYY-MM-DD. Omit this (and startDate/endDate) to use today's actual date — don't guess a date yourself."
      ),
    startDate: z.string().optional().describe("First day of a period, YYYY-MM-DD, inclusive."),
    endDate: z.string().optional().describe("Last day of a period, YYYY-MM-DD, inclusive. Defaults to today when only startDate is given."),
    ...SCOPE_INPUT,
  }),
  execute: async ({ date, startDate, endDate, developer, lender }) => {
    const [draws, projects, rows] = await Promise.all([getAllDraws(), getProjects(), getLivePayments()]);
    const scoped = projectScope({ developer, lender }, projects);
    if ("error" in scoped) return { error: scoped.error };
    const inScopeIds = scoped.ids(projects);
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const drawById = new Map(draws.map((d) => [d.id, d]));

    // Real receipts, plus one synthetic receipt for any draw that has money
    // received but no receipt rows (see lib/paymentHistory.ts).
    const receipts = paymentsForDraws(draws, rows, (iso) => businessTodayISO(new Date(iso))).filter((r) =>
      inScopeIds.has(drawById.get(r.draw_id)!.project_id)
    );
    const toRow = (r: (typeof receipts)[number]) => {
      const d = drawById.get(r.draw_id)!;
      return {
        project: projectNameById.get(d.project_id) ?? "Unknown project",
        drawNumber: d.draw_number,
        receivedOn: r.date_received,
        amountReceived: r.amount,
        drawTotalReceived: d.amount_paid,
        retainageHeld: d.retainage_held,
      };
    };

    if (startDate || endDate) {
      const from = startDate ?? "0000-01-01";
      const to = endDate ?? businessTodayISO();
      const payments = receipts
        .filter((r) => r.date_received >= from && r.date_received <= to)
        .map(toRow)
        .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
      const byProject = new Map<string, { project: string; totalReceived: number; payments: number }>();
      for (const p of payments) {
        const row = byProject.get(p.project) ?? { project: p.project, totalReceived: 0, payments: 0 };
        row.totalReceived = Math.round((row.totalReceived + p.amountReceived) * 100) / 100;
        row.payments += 1;
        byProject.set(p.project, row);
      }
      return {
        scope: scoped.label,
        period: { startDate: from === "0000-01-01" ? null : from, endDate: to },
        totalReceived: Math.round(payments.reduce((a, p) => a + p.amountReceived, 0) * 100) / 100,
        byProject: [...byProject.values()].sort((a, b) => b.totalReceived - a.totalReceived),
        payments,
      };
    }

    const targetDate = date ?? businessTodayISO();
    return {
      scope: scoped.label,
      date: targetDate,
      payments: receipts.filter((r) => r.date_received === targetDate).map(toRow),
    };
  },
});

export const getAgingSummaryTool = tool({
  description:
    "Get the same 0-30/31-60/61-90/90+ day aging buckets shown on the dashboard's Open Draws section — count and outstanding amount per bucket, across all projects including closed ones (each draw says whether its project is closed), using the server's actual current date. Use this instead of computing 'days outstanding' yourself from getOpenDraws, since you don't have a live clock.",
  inputSchema: z.object(SCOPE_INPUT),
  execute: async ({ developer, lender }) => {
    const [all, projects] = await Promise.all([getOpenDraws(), getProjects()]);
    const scoped = projectScope({ developer, lender }, projects);
    if ("error" in scoped) return { error: scoped.error };
    const draws = all.filter((d) => scoped.include(d.project));
    const withAge = draws.map((d) => ({
      draw: d,
      age: daysOpen(d.date_submitted ?? d.created_at),
    }));

    return {
      scope: scoped.label,
      buckets: AGING_BUCKETS.map((bucket) => {
        const inBucket = withAge.filter((x) => agingBucket(x.age) === bucket);
        return {
          bucket,
          count: inBucket.length,
          amount: inBucket.reduce((acc, x) => acc + openBalance(x.draw), 0),
        };
      }),
      draws: withAge.map((x) => ({
        project: x.draw.project.name,
        projectStatus: x.draw.project.status,
        drawNumber: x.draw.draw_number,
        daysOutstanding: x.age,
        bucket: agingBucket(x.age),
        outstandingBalance: openBalance(x.draw),
      })),
    };
  },
});

export const getBillingSummaryTool = tool({
  description:
    "Get YTD/QTD billed-vs-received totals, average days to pay, and average days to approve (submitted to date_approved — the owner/lender's own turnaround, separate from days to pay), portfolio-wide by quarter and broken down by project, by developer and by lender, for a given calendar year — matches the Billing Summary page. byDeveloper / byLender answer 'how much did we bill / collect for HVN' and 'average days to pay for <lender>' directly (projects with no developer or lender are grouped as Unassigned). Covers ALL projects, active and closed (closing a project never removes its history). Also returns currentOutstanding, the actual current outstanding balance (per-draw collectible balances, portfolio-wide including closed projects, as of today, not scoped to the requested year). ytdRequested minus ytdReceived is NOT the outstanding balance — it's that year's billed-vs-received activity difference, which can be negative (e.g. a December draw paid in January) even when nothing is actually still owed; use currentOutstanding for 'how much is still owed' questions. Defaults to the current year if omitted.",
  inputSchema: z.object({
    year: z.number().int().optional().describe("Calendar year, e.g. 2026. Defaults to the current year."),
  }),
  execute: async ({ year }) => {
    const targetYear = year ?? businessToday().getFullYear();
    const [report, byProject, byDeveloper, byLender, dashboard] = await Promise.all([
      getBillingReport(targetYear),
      getProjectBillingBreakdown(targetYear),
      getDeveloperBillingBreakdown(targetYear),
      getLenderBillingBreakdown(targetYear),
      getDashboardData(),
    ]);
    const group = (g: (typeof byDeveloper)[number]) => ({
      name: g.groupName,
      requested: g.requested,
      received: g.received,
      avgDaysToPay: g.avgDaysToPay,
      avgDaysToApprove: g.avgDaysToApprove,
      onTimeCount: g.onTimeCount,
      lateCount: g.lateCount,
    });

    return {
      scope: "All projects, active and closed",
      year: targetYear,
      ytdRequested: report.ytdRequested,
      ytdReceived: report.ytdReceived,
      ytdAvgDaysToPay: report.ytdAvgDaysToPay,
      ytdAvgDaysToApprove: report.ytdAvgDaysToApprove,
      currentOutstanding: dashboard.totals.totalOpenToOwner,
      quarters: report.quarters,
      byProject: byProject.map((p) => ({
        project: p.projectName,
        requested: p.requested,
        received: p.received,
        avgDaysToPay: p.avgDaysToPay,
        avgDaysToApprove: p.avgDaysToApprove,
      })),
      byDeveloper: byDeveloper.map(group),
      byLender: byLender.map(group),
    };
  },
});

export const getScheduleOfValuesTool = tool({
  description:
    "Get the full schedule-of-values line items for one project (item number, category, description, scheduled value, retention-exempt flag, excluded-from-contract flag) — use for 'what's the SoV for X' or 'how much is budgeted for Y' questions. totalScheduledValue is the full sheet total; totalContractValue excludes any owner-paid items (e.g. architect/permit fees) flagged excludedFromContract — use totalContractValue when the question is about HTA's actual contract value.",
  inputSchema: z.object({
    projectName: z.string().describe("The project name, or a close match (e.g. 'Aneta')"),
  }),
  execute: async ({ projectName }) => {
    const resolved = await resolveProject(projectName);
    if ("error" in resolved) return { error: resolved.error };

    const budgetLines = await getBudgetLinesForProject(resolved.project.id);
    return {
      project: resolved.project.name,
      totalScheduledValue: budgetLines.reduce((acc, l) => acc + l.scheduled_value, 0),
      totalContractValue: contractValue(budgetLines),
      lines: budgetLines.map((l) => ({
        itemNumber: l.item_number,
        category: l.category,
        description: l.description,
        scheduledValue: l.scheduled_value,
        retentionExempt: l.retention_exempt,
        retentionRateOverridePercent: l.retention_rate_override,
        excludedFromContract: l.excluded_from_contract,
      })),
    };
  },
});

export const getDrawScheduleStatusTool = tool({
  description:
    "Check each active project's recurring draw cadence (e.g. due the 25th, or the last Thursday of the month) and whether a NEW draft still needs to be created for the current cycle. Distinct from getOpenDraws, which only covers draws that already exist — this answers 'which projects haven't had a draw started yet this month.' isUrgent turns true starting 5 days before the due date; isOverdue once the date has passed with nothing created. Only includes active projects that have a cadence configured — closed projects no longer generate reminders.",
  inputSchema: z.object({}),
  execute: async () => {
    const { rollups } = await getDashboardData();
    return rollups
      .filter((r) => r.nextDrawLabel !== null)
      .map((r) => ({
        project: r.project.name,
        nextDrawDue: r.nextDrawLabel,
        isUrgent: r.isDrawUrgent,
        isOverdue: r.isDrawOverdue,
      }));
  },
});

export const getProjectDetailsTool = tool({
  description:
    "Get full details for one project by name: every draw (status/dates/amounts/notes), schedule-of-values line items, and paid/open/contract-value totals. Each draw's notes often explain why its outstanding balance looks unusual (a fee withheld, an amount written off, an owner-paid item) — check them before answering a 'why does X look off' question. daysToApprove is the submitted-to-approved lag: a live running count if still awaiting approval, the final number once approved, or null if not applicable.",
  inputSchema: z.object({
    projectName: z
      .string()
      .describe("The project name, or a close match (e.g. 'Aneta')"),
  }),
  execute: async ({ projectName }) => {
    const resolved = await resolveProject(projectName);
    if ("error" in resolved) return { error: resolved.error };
    const project = resolved.project;

    const [rawDraws, budgetLines, allocations, paymentRows] = await Promise.all([
      getDrawsForProject(project.id),
      getBudgetLinesForProject(project.id),
      getAllocationsForProject(project.id),
      getPaymentsForProject(project.id),
    ]);
    const excludedMap = excludedAllocationByDraw(allocations, budgetLines);
    const draws = rawDraws.map((d) => ({ ...d, excluded_allocated: excludedMap.get(d.id) ?? 0 }));

    const totalPaidToOwner = draws
      .filter((d) => d.status !== "draft")
      .reduce((acc, d) => acc + d.amount_paid, 0);
    const totalOpenToOwner = draws.reduce((acc, d) => acc + openBalance(d), 0);
    const totalBudget = contractValue(budgetLines);

    return {
      project: {
        name: project.name,
        address: project.address,
        lender: project.lender,
        status: project.status,
      },
      totals: {
        totalPaidToOwner,
        totalOpenToOwner,
        totalBudget,
        totalRetainageHeld: draws
          .filter((d) => d.status !== "draft")
          .reduce((acc, d) => acc + (Number(d.retainage_held) || 0), 0),
      },
      ...(project.status === "closed"
        ? {
            statusNote:
              "This project is closed. Closed does not mean fully paid: any open balance and retainage above are still owed and still counted in the portfolio's outstanding figures.",
          }
        : {}),
      draws: draws.map((d) => ({
        drawNumber: d.draw_number,
        status: d.status,
        amountRequested: d.amount_requested,
        amountApproved: d.amount_approved,
        amountPaid: d.amount_paid,
        retainageHeld: d.retainage_held,
        dateSubmitted: d.date_submitted,
        dateApproved: d.date_approved,
        datePaid: d.date_paid,
        // Each payment with its own date; amountPaid is their total and
        // datePaid the most recent one.
        payments: paymentsForDraws(
          [d],
          paymentRows.filter((r) => r.draw_id === d.id),
          (iso) => businessTodayISO(new Date(iso))
        ).map((r) => ({ amount: r.amount, date: r.date_received })),
        daysToApprove: daysToApprove(d),
        notes: d.notes,
      })),
      budgetLineCount: budgetLines.length,
    };
  },
});

export const getOutstandingSummaryTool = tool({
  description:
    "Answer 'what is still owed?' across the whole portfolio. Returns the collectible outstanding balance for ALL projects, split into active and closed projects (closed projects can still be owed money — Closed does not mean fully paid), the retainage held across all projects (tracked separately, NOT included in outstanding) with the closed projects that still hold retainage, and small residual balances of $1,000 or less that are counted in the total but not listed by getOpenDraws. Independent of the dashboard's Active/All view. Pass `developer` and/or `lender` to limit to their projects. Use getOpenDraws for the per-draw list and getAgingSummary for age.",
  inputSchema: z.object(SCOPE_INPUT),
  execute: async ({ developer, lender }) => {
    const dash = await getDashboardData();
    const scoped = projectScope({ developer, lender }, dash.rollups.map((r) => r.project));
    if ("error" in scoped) return { error: scoped.error };
    const rollups = dash.rollups.filter((r) => scoped.include(r.project));
    const inScopeProjects = new Set(rollups.map((r) => r.project.id));
    const residuals = dash.residuals.filter((r) => inScopeProjects.has(r.projectId));
    const o = outstandingAcrossAll(rollups);
    return {
      scope: scoped.label,
      outstanding: { total: o.total, activeProjects: o.active, closedProjects: o.closed },
      retainageHeld: {
        note: "Tracked separately; not part of the outstanding figure.",
        total: o.retainageTotal,
        activeProjects: o.retainageActive,
        closedProjects: o.retainageClosed,
        closedProjectsHoldingRetainage: o.closedWithRetainage.map((p) => ({
          project: p.projectName,
          retainageHeld: p.amount,
        })),
      },
      residualBalances: {
        note: "Each is $1,000 or less: included in the outstanding total but not shown in the open-draws list or aging alerts.",
        draws: residuals.map((r) => ({
          project: r.projectName,
          projectStatus: r.projectStatus,
          drawNumber: r.drawNumber,
          balance: r.balance,
        })),
      },
      closedProjectsWithOutstanding: rollups
        .filter((r) => r.project.status === "closed" && r.totalOpenToOwner > 0.005)
        .map((r) => ({ project: r.project.name, outstanding: r.totalOpenToOwner })),
    };
  },
});

// One implementation for "everything about one developer" and "everything about
// one lender". invoicedToDate is the amount requested on every submitted,
// approved or paid draw (net of retainage, as on the G702's current payment due);
// drafts are not invoiced yet and are reported separately.
async function summarizeGroup(field: GroupField, name: string) {
  const [dash, openDraws] = await Promise.all([getDashboardData(), getOpenDraws()]);
  const match = matchGroup(field, name, dash.rollups.map((r) => r.project));
  if ("error" in match) return { error: match.error };
  return buildGroupSummary(field, match.name, dash.rollups, openDraws, dash.residuals);
}

const GROUP_DESCRIPTION = (who: string, example: string) =>
  `Answer questions about ONE ${who}'s projects, e.g. ${example}. Covers all of their projects, active and closed. Returns per project and in total: invoicedToDate (the amount requested on every submitted, approved or paid draw — net of retainage, as on the G702's current payment due; drafts are NOT invoiced yet and are reported separately), paidToDate, outstanding (still collectible), retainageHeld (separate from outstanding), and draftsNotYetSubmitted. Also lists the unpaid draws. 'Invoiced' means billed to date, which is different from 'open/outstanding' (the unpaid part) — answer the one that was asked and say which you used.`;

export const getDeveloperSummaryTool = tool({
  description: GROUP_DESCRIPTION("developer", "'what have we invoiced for HVN', 'what does HVN owe us', 'how much has HVN paid'"),
  inputSchema: z.object({
    developer: z.string().describe("The developer name, or a close match (e.g. 'HVN')"),
  }),
  execute: async ({ developer }) => summarizeGroup("developer", developer),
});

export const getLenderSummaryTool = tool({
  description: GROUP_DESCRIPTION("lender", "'what have we invoiced to <lender>', 'what is outstanding on <lender>'s projects'"),
  inputSchema: z.object({
    lender: z.string().describe("The lender name, or a close match"),
  }),
  execute: async ({ lender }) => summarizeGroup("lender", lender),
});

export const getMonthlyBillingTool = tool({
  description:
    "Invoiced and received month by month (the same numbers as the Monthly Billing chart), for one calendar year. Use for 'what did we invoice / collect in September', 'month by month this year', 'which month was strongest'. invoiced is by the month each invoice was submitted (drafts excluded) and received by the month each payment came in, so the two can land in different months. Covers all projects, active and closed, unless you pass `project`, `developer` and/or `lender`. Defaults to the current year.",
  inputSchema: z.object({
    year: z.number().int().optional().describe("Calendar year, e.g. 2026. Defaults to the current year."),
    project: z.string().optional().describe("Limit to one project, by name or a close match."),
    ...SCOPE_INPUT,
  }),
  execute: async ({ year, project, developer, lender }) => {
    const targetYear = year ?? businessToday().getFullYear();
    const projects = await getProjects();
    const scoped = projectScope({ developer, lender }, projects);
    if ("error" in scoped) return { error: scoped.error };
    let ids = scoped.ids(projects);
    let label = scoped.label;
    if (project && project.trim()) {
      const resolved = await resolveProject(project);
      if ("error" in resolved) return { error: resolved.error };
      if (!ids.has(resolved.project.id)) {
        return { error: `${resolved.project.name} is not in the requested developer/lender scope.` };
      }
      ids = new Set([resolved.project.id]);
      label = `Project ${resolved.project.name} only`;
    }
    const all = await getMonthlyBilling(ids.size === projects.length ? undefined : ids);
    const months = all
      .filter((m) => m.key.startsWith(`${targetYear}-`))
      .map((m) => ({
        month: m.key,
        label: m.label,
        invoiced: Math.round(m.invoiced * 100) / 100,
        received: Math.round(m.paid * 100) / 100,
      }));
    const total = (f: (m: (typeof months)[number]) => number) =>
      Math.round(months.reduce((a, m) => a + f(m), 0) * 100) / 100;
    return {
      scope: label,
      year: targetYear,
      totalInvoiced: total((m) => m.invoiced),
      totalReceived: total((m) => m.received),
      months,
    };
  },
});
