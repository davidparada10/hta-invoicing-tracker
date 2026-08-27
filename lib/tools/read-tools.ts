import { tool } from "ai";
import { z } from "zod";
import {
  getDashboardData,
  getOpenDraws,
  getDrawsForProject,
  getBudgetLinesForProject,
  openBalance,
} from "@/lib/data";
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
