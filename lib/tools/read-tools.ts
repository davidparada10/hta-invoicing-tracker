import { tool } from "ai";
import { z } from "zod";
import {
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
import { resolveProject } from "./shared";

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
    "Get YTD/QTD billed-vs-received totals and average days to pay, portfolio-wide by quarter and broken down by project, for a given calendar year — matches the Billing Summary page. Defaults to the current year if omitted.",
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
      quarters: report.quarters,
      byProject: byProject.map((p) => ({
        project: p.projectName,
        requested: p.requested,
        received: p.received,
        avgDaysToPay: p.avgDaysToPay,
      })),
    };
  },
});

export const getScheduleOfValuesTool = tool({
  description:
    "Get the full schedule-of-values line items for one project (item number, category, description, scheduled value, retention-exempt flag) — use for 'what's the SoV for X' or 'how much is budgeted for Y' questions.",
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
      lines: budgetLines.map((l) => ({
        itemNumber: l.item_number,
        category: l.category,
        description: l.description,
        scheduledValue: l.scheduled_value,
        retentionExempt: l.retention_exempt,
      })),
    };
  },
});

export const getProjectDetailsTool = tool({
  description:
    "Get full details for one project by name: every draw (status/dates/amounts), schedule-of-values line items, and paid/open/contract-value totals.",
  inputSchema: z.object({
    projectName: z
      .string()
      .describe("The project name, or a close match (e.g. 'Aneta')"),
  }),
  execute: async ({ projectName }) => {
    const resolved = await resolveProject(projectName);
    if ("error" in resolved) return { error: resolved.error };
    const project = resolved.project;

    const [draws, budgetLines] = await Promise.all([
      getDrawsForProject(project.id),
      getBudgetLinesForProject(project.id),
    ]);

    const totalPaidToOwner = draws
      .filter((d) => d.status !== "draft")
      .reduce((acc, d) => acc + d.amount_paid, 0);
    const totalOpenToOwner = draws.reduce((acc, d) => acc + openBalance(d), 0);
    const totalBudget = budgetLines.reduce((acc, l) => acc + l.scheduled_value, 0);

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
      })),
      budgetLineCount: budgetLines.length,
    };
  },
});
