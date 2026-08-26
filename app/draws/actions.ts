"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseDrawAllocationsFromXlsx,
  parseG702FromPdf,
  parseG702FromXlsx,
  ParsedG702Draw,
} from "@/lib/g702-parser";

export interface ParsedG702Upload extends ParsedG702Draw {
  allocations: { budget_line_id: string; amount: number }[];
  allocationsMatched: number;
  allocationsFound: number;
}

export async function parseG702Upload(formData: FormData): Promise<ParsedG702Upload> {
  const file = formData.get("g702_file");
  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }
  const projectId = formData.get("project_id");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const parsed = await parseG702FromPdf(buffer);
    return { ...parsed, allocations: [], allocationsMatched: 0, allocationsFound: 0 };
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel")
  ) {
    const parsed = parseG702FromXlsx(buffer);
    const allocationLines = parseDrawAllocationsFromXlsx(buffer);

    let allocations: { budget_line_id: string; amount: number }[] = [];
    if (allocationLines.length > 0 && typeof projectId === "string" && projectId) {
      const supabase = createServerSupabaseClient();
      const { data: budgetLines, error } = await supabase
        .from("inv_project_budget_lines")
        .select("id, item_number")
        .eq("project_id", projectId);
      if (error) throw error;

      const byItemNumber = new Map(
        (budgetLines ?? [])
          .filter((l) => l.item_number)
          .map((l) => [l.item_number!.trim().toLowerCase(), l.id])
      );
      allocations = allocationLines
        .map((a) => {
          const budgetLineId = byItemNumber.get(a.item_number.trim().toLowerCase());
          return budgetLineId ? { budget_line_id: budgetLineId, amount: a.amount_this_period } : null;
        })
        .filter((a): a is { budget_line_id: string; amount: number } => a !== null);
    }

    return {
      ...parsed,
      allocations,
      allocationsMatched: allocations.length,
      allocationsFound: allocationLines.length,
    };
  }

  throw new Error("Unsupported file type. Please upload a .xlsx or .pdf file.");
}

function toNumber(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

interface AllocationInput {
  budget_line_id: string;
  amount: number;
}

function parseAllocations(formData: FormData): AllocationInput[] {
  const raw = formData.get("allocations");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (a): a is AllocationInput =>
        a && typeof a.budget_line_id === "string" && typeof a.amount === "number"
    )
    .filter((a) => a.amount !== 0);
}

async function saveAllocations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  drawId: string,
  allocations: AllocationInput[]
) {
  const { error: deleteError } = await supabase
    .from("inv_draw_line_allocations")
    .delete()
    .eq("draw_id", drawId);
  if (deleteError) throw deleteError;

  if (allocations.length === 0) return;

  const { error: insertError } = await supabase.from("inv_draw_line_allocations").insert(
    allocations.map((a) => ({
      draw_id: drawId,
      budget_line_id: a.budget_line_id,
      amount: a.amount,
    }))
  );
  if (insertError) throw insertError;
}

export async function upsertDraw(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = toNullableString(formData.get("id"));
  const projectId = formData.get("project_id") as string;
  const allocations = parseAllocations(formData);

  const payload = {
    project_id: projectId,
    draw_number: toNumber(formData.get("draw_number")),
    period_start: toNullableString(formData.get("period_start")),
    period_end: toNullableString(formData.get("period_end")),
    amount_requested: toNumber(formData.get("amount_requested")),
    amount_approved: toNumber(formData.get("amount_approved")),
    retainage_held: toNumber(formData.get("retainage_held")),
    amount_paid: toNumber(formData.get("amount_paid")),
    date_submitted: toNullableString(formData.get("date_submitted")),
    date_approved: toNullableString(formData.get("date_approved")),
    date_paid: toNullableString(formData.get("date_paid")),
    status: formData.get("status") as string,
    notes: toNullableString(formData.get("notes")),
  };

  let drawId = id;
  if (id) {
    const { error } = await supabase.from("inv_owner_draws").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("inv_owner_draws")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    drawId = data.id;
  }

  if (drawId) {
    await saveAllocations(supabase, drawId, allocations);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function markDrawPaid(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();

  const { data: draw, error: fetchError } = await supabase
    .from("inv_owner_draws")
    .select("amount_requested")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("inv_owner_draws")
    .update({
      status: "paid",
      amount_paid: draw.amount_requested,
      date_paid: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function deleteDraw(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("inv_owner_draws").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}
