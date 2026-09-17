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
  getProjects,
  getBillingReport,
  getProjectBillingBreakdown,
  openBalance,
} from "@/lib/data";
import { AGING_BUCKETS, agingBucket, daysOpen } from "@/lib/aging";
import { parseLocalDate } from "@/lib/format";
import { resolveProject } from "./shared";
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

export const listProjectsTool = tool({
  description:
    "List every project with its paid-to-owner, currently-invoiced (open), contract value, and retainage totals. Use this for portfolio-wide questions or to find/confirm a project's exact name.",
  inputSchema: z.object({}),
  execute: async () => {
    const { rollups, totals } = await getDashboardData();
    return {
      totals,
      projects: rollups.map((r) => ({
        name: r.project.name,
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
    "List owner draws across every project that still have a balance owed (amount requested minus amount actually paid), oldest first — including a draw marked 'paid' for less than it requested. This is the 'what's currently invoiced/outstanding' view.",
  inputSchema: z.object({}),
  execute: async () => {
    const draws = await getOpenDraws();
    return draws.map((d) => ({
      project: d.project.name,
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
    "List every draw with a payment recorded on a specific date, across all projects, in one call — use this for 'what got paid today/yesterday/on <date>' instead of checking each project individually. Defaults to today's date (server clock) if no date is given.",
  inputSchema: z.object({
    date: z
      .string()
      .optional()
      .describe(
        "Date to check, as YYYY-MM-DD. Omit this to use today's actual date — don't guess a date yourself."
      ),
  }),
  execute: async ({ date }) => {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const [draws, projects] = await Promise.all([getAllDraws(), getProjects()]);
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

    const payments = draws
      .filter((d) => d.date_paid === targetDate)
      .map((d) => ({
        project: projectNameById.get(d.project_id) ?? "Unknown project",
        drawNumber: d.draw_number,
        amountPaid: d.amount_paid,
        retainageHeld: d.retainage_held,
      }));

    return { date: targetDate, payments };
  },
});

export const getAgingSummaryTool = tool({
  description:
    "Get the same 0-30/31-60/61-90/90+ day aging buckets shown on the dashboard's Open Draws section — count and outstanding amount per bucket, using the server's actual current date. Use this instead of computing 'days outstanding' yourself from getOpenDraws, since you don't have a live clock.",
  inputSchema: z.object({}),
  execute: async () => {
    const draws = await getOpenDraws();
    const withAge = draws.map((d) => ({
      draw: d,
      age: daysOpen(d.date_submitted ?? d.created_at),
    }));

    return {
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
    "Get YTD/QTD billed-vs-received totals, average days to pay, and average days to approve (submitted to date_approved — the owner/lender's own turnaround, separate from days to pay), portfolio-wide by quarter and broken down by project, for a given calendar year — matches the Billing Summary page. Defaults to the current year if omitted.",
  inputSchema: z.object({
    year: z.number().int().optional().describe("Calendar year, e.g. 2026. Defaults to the current year."),
  }),
  execute: async ({ year }) => {
    const targetYear = year ?? new Date().getFullYear();
    const [report, byProject] = await Promise.all([
      getBillingReport(targetYear),
      getProjectBillingBreakdown(targetYear),
    ]);

    return {
      year: targetYear,
      ytdRequested: report.ytdRequested,
      ytdReceived: report.ytdReceived,
      ytdAvgDaysToPay: report.ytdAvgDaysToPay,
      ytdAvgDaysToApprove: report.ytdAvgDaysToApprove,
      quarters: report.quarters,
      byProject: byProject.map((p) => ({
        project: p.projectName,
        requested: p.requested,
        received: p.received,
        avgDaysToPay: p.avgDaysToPay,
        avgDaysToApprove: p.avgDaysToApprove,
      })),
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
        excludedFromContract: l.excluded_from_contract,
      })),
    };
  },
});

export const getDrawScheduleStatusTool = tool({
  description:
    "Check each active project's recurring draw cadence (e.g. due the 25th, or the last Thursday of the month) and whether a NEW draft still needs to be created for the current cycle. Distinct from getOpenDraws, which only covers draws that already exist — this answers 'which projects haven't had a draw started yet this month.' isUrgent turns true starting 5 days before the due date; isOverdue once the date has passed with nothing created. Only includes projects that have a cadence configured.",
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

    const [rawDraws, budgetLines, allocations] = await Promise.all([
      getDrawsForProject(project.id),
      getBudgetLinesForProject(project.id),
      getAllocationsForProject(project.id),
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
      totals: { totalPaidToOwner, totalOpenToOwner, totalBudget },
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
        daysToApprove: daysToApprove(d),
        notes: d.notes,
      })),
      budgetLineCount: budgetLines.length,
    };
  },
});
