import { tool } from "ai";
import { z } from "zod";
import {
  getDashboardData,
  getOpenDraws,
  getDrawsForProject,
  getSubInvoicesForProject,
  getBudgetLinesForProject,
} from "@/lib/data";
import { resolveProject } from "./shared";

export const listProjectsTool = tool({
  description:
    "List every project with its paid-to-owner, currently-invoiced (open), sub invoice, and retainage totals. Use this for portfolio-wide questions or to find/confirm a project's exact name.",
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
        totalSubOutstanding: r.totalSubOutstanding,
        totalRetainage: r.totalDrawRetainage + r.totalSubRetainage,
      })),
    };
  },
});

export const getOpenDrawsTool = tool({
  description:
    "List owner draws across every project that are submitted or approved but not yet paid (awaiting payment), oldest first. This is the 'what's currently invoiced' view.",
  inputSchema: z.object({}),
  execute: async () => {
    const draws = await getOpenDraws();
    return draws.map((d) => ({
      project: d.project.name,
      drawNumber: d.draw_number,
      status: d.status,
      amountRequested: d.amount_requested,
      dateSubmitted: d.date_submitted,
    }));
  },
});

export const getProjectDetailsTool = tool({
  description:
    "Get full details for one project by name: every draw (status/dates/amounts), sub invoices, budget line items, and paid/open/budget totals.",
  inputSchema: z.object({
    projectName: z
      .string()
      .describe("The project name, or a close match (e.g. 'Aneta')"),
  }),
  execute: async ({ projectName }) => {
    const resolved = await resolveProject(projectName);
    if ("error" in resolved) return { error: resolved.error };
    const project = resolved.project;

    const [draws, subInvoices, budgetLines] = await Promise.all([
      getDrawsForProject(project.id),
      getSubInvoicesForProject(project.id),
      getBudgetLinesForProject(project.id),
    ]);

    const totalPaidToOwner = draws
      .filter((d) => d.status === "paid")
      .reduce((acc, d) => acc + d.amount_paid, 0);
    const totalOpenToOwner = draws
      .filter((d) => d.status === "submitted" || d.status === "approved")
      .reduce((acc, d) => acc + d.amount_requested, 0);
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
      subInvoices: subInvoices.map((s) => ({
        subcontractor: s.subcontractor_name,
        trade: s.trade,
        amount: s.amount,
        amountPaid: s.amount_paid,
        status: s.status,
      })),
      budgetLineCount: budgetLines.length,
    };
  },
});
