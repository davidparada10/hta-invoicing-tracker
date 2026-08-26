import { tool } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveProject } from "./shared";

export const createDrawTool = tool({
  description:
    "Create a new owner draw for a project. Use when the user describes a new draw/invoice to add manually (not via G702 file upload).",
  inputSchema: z.object({
    projectName: z.string(),
    drawNumber: z.number().int(),
    amountRequested: z.number(),
    amountApproved: z.number().optional(),
    retainageHeld: z.number().optional(),
    periodStart: z.string().optional().describe("YYYY-MM-DD"),
    periodEnd: z.string().optional().describe("YYYY-MM-DD"),
    dateSubmitted: z.string().optional().describe("YYYY-MM-DD"),
    dateApproved: z.string().optional().describe("YYYY-MM-DD"),
    status: z.enum(["draft", "submitted", "approved", "paid"]).default("draft"),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const resolved = await resolveProject(input.projectName);
    if ("error" in resolved) return { error: resolved.error };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("inv_owner_draws").insert({
      project_id: resolved.project.id,
      draw_number: input.drawNumber,
      amount_requested: input.amountRequested,
      amount_approved: input.amountApproved ?? 0,
      retainage_held: input.retainageHeld ?? 0,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      date_submitted: input.dateSubmitted ?? null,
      date_approved: input.dateApproved ?? null,
      status: input.status,
      notes: input.notes ?? null,
    });
    if (error) return { error: error.message };

    revalidatePath(`/projects/${resolved.project.id}`);
    revalidatePath("/");
    return { success: true, project: resolved.project.name, drawNumber: input.drawNumber };
  },
});

export const markDrawPaidTool = tool({
  description:
    "Mark an existing owner draw as paid. Sets amount paid equal to the amount requested and the paid date to today.",
  inputSchema: z.object({
    projectName: z.string(),
    drawNumber: z.number().int(),
  }),
  execute: async ({ projectName, drawNumber }) => {
    const resolved = await resolveProject(projectName);
    if ("error" in resolved) return { error: resolved.error };

    const supabase = createServerSupabaseClient();
    const { data: draw, error: fetchError } = await supabase
      .from("inv_owner_draws")
      .select("id, amount_requested")
      .eq("project_id", resolved.project.id)
      .eq("draw_number", drawNumber)
      .maybeSingle();
    if (fetchError) return { error: fetchError.message };
    if (!draw) return { error: `Draw #${drawNumber} not found for ${resolved.project.name}.` };

    const { error } = await supabase
      .from("inv_owner_draws")
      .update({
        status: "paid",
        amount_paid: draw.amount_requested,
        date_paid: new Date().toISOString().slice(0, 10),
      })
      .eq("id", draw.id);
    if (error) return { error: error.message };

    revalidatePath(`/projects/${resolved.project.id}`);
    revalidatePath("/");
    return { success: true, project: resolved.project.name, drawNumber };
  },
});

export const createSubInvoiceTool = tool({
  description: "Add a new subcontractor invoice to a project.",
  inputSchema: z.object({
    projectName: z.string(),
    subcontractorName: z.string(),
    trade: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional().describe("YYYY-MM-DD"),
    amount: z.number(),
    retainageHeld: z.number().optional(),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const resolved = await resolveProject(input.projectName);
    if ("error" in resolved) return { error: resolved.error };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("inv_sub_invoices").insert({
      project_id: resolved.project.id,
      subcontractor_name: input.subcontractorName,
      trade: input.trade ?? null,
      invoice_number: input.invoiceNumber ?? null,
      invoice_date: input.invoiceDate ?? null,
      amount: input.amount,
      retainage_held: input.retainageHeld ?? 0,
      amount_paid: 0,
      status: "received",
      notes: input.notes ?? null,
    });
    if (error) return { error: error.message };

    revalidatePath(`/projects/${resolved.project.id}`);
    return { success: true, project: resolved.project.name, subcontractor: input.subcontractorName };
  },
});

export const createBudgetLineTool = tool({
  description: "Add a new line item to a project's budget.",
  inputSchema: z.object({
    projectName: z.string(),
    description: z.string(),
    scheduledValue: z.number(),
    itemNumber: z.string().optional(),
    category: z.string().optional(),
  }),
  execute: async (input) => {
    const resolved = await resolveProject(input.projectName);
    if ("error" in resolved) return { error: resolved.error };

    const supabase = createServerSupabaseClient();
    const { data: max } = await supabase
      .from("inv_project_budget_lines")
      .select("sort_order")
      .eq("project_id", resolved.project.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("inv_project_budget_lines").insert({
      project_id: resolved.project.id,
      item_number: input.itemNumber ?? null,
      category: input.category ?? null,
      description: input.description,
      scheduled_value: input.scheduledValue,
      sort_order: (max?.sort_order ?? 0) + 1,
    });
    if (error) return { error: error.message };

    revalidatePath(`/projects/${resolved.project.id}`);
    return { success: true, project: resolved.project.name, description: input.description };
  },
});
