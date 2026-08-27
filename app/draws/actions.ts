"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DrawStatus, BudgetLine, DrawLineAllocation } from "@/lib/types";
import { getAllocationsForProject, getBudgetLinesForProject } from "@/lib/data";
import {
  extractPdfText,
  parseDrawAllocationsFromXlsx,
  parseG702FromPdf,
  parseG702FromXlsx,
  ParsedG702Draw,
} from "@/lib/g702-parser";
import { isLenderPortalPdfText, parseLenderDrawFromPdf } from "@/lib/lender-portal-parser";

function normalizeMatchKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Maps a key to a budget line id only when the key is unique across all
// lines — an ambiguous key (e.g. duplicate item numbers on unrelated line
// items) is left out entirely rather than guessing and misfiling an amount.
function buildUniqueMatchMap(pairs: [string, string][]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const [key] of pairs) counts.set(key, (counts.get(key) ?? 0) + 1);
  const map = new Map<string, string>();
  for (const [key, id] of pairs) {
    if (key && counts.get(key) === 1) map.set(key, id);
  }
  return map;
}

export interface ParsedG702Upload extends ParsedG702Draw {
  allocations: { budget_line_id: string; amount: number }[];
  allocationsMatched: number;
  allocationsFound: number;
}

async function matchAllocationsToBudgetLines(
  projectId: string,
  lines: { item_number: string; description: string; amount: number }[]
): Promise<{ budget_line_id: string; amount: number }[]> {
  if (lines.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const { data: budgetLines, error } = await supabase
    .from("inv_project_budget_lines")
    .select("id, item_number, description")
    .eq("project_id", projectId);
  if (error) throw error;

  // Item numbers can collide across unrelated line items within the same
  // schedule of values (seen in practice — two different lines both
  // numbered "1"), so match on description text first and only fall back
  // to item number when a line has no unambiguous description match.
  const byDescription = buildUniqueMatchMap(
    (budgetLines ?? []).map((l) => [normalizeMatchKey(l.description), l.id])
  );
  const byItemNumber = buildUniqueMatchMap(
    (budgetLines ?? [])
      .filter((l) => l.item_number)
      .map((l) => [normalizeMatchKey(l.item_number!), l.id])
  );

  return lines
    .map((a) => {
      const budgetLineId =
        byDescription.get(normalizeMatchKey(a.description)) ??
        byItemNumber.get(normalizeMatchKey(a.item_number));
      return budgetLineId ? { budget_line_id: budgetLineId, amount: a.amount } : null;
    })
    .filter((a): a is { budget_line_id: string; amount: number } => a !== null);
}

export async function parseG702Upload(formData: FormData): Promise<ParsedG702Upload> {
  const file = formData.get("g702_file");
  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }
  const projectIdRaw = formData.get("project_id");
  const projectId = typeof projectIdRaw === "string" ? projectIdRaw : "";

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(buffer);

    if (isLenderPortalPdfText(text)) {
      const parsed = await parseLenderDrawFromPdf(buffer);
      const allocationLines = parsed.allocations.map((a) => ({
        item_number: a.item_number,
        description: a.description,
        amount: a.requested_value,
      }));
      const allocations = projectId
        ? await matchAllocationsToBudgetLines(projectId, allocationLines)
        : [];
      return {
        draw_number: parsed.draw_number,
        period_end: parsed.period_end,
        amount_requested: parsed.amount_requested,
        retainage_held: parsed.retainage_held,
        allocations,
        allocationsMatched: allocations.length,
        allocationsFound: allocationLines.length,
      };
    }

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
    const allocationLines = parseDrawAllocationsFromXlsx(buffer).map((a) => ({
      item_number: a.item_number,
      description: a.description,
      amount: a.amount_this_period,
    }));
    const allocations = projectId
      ? await matchAllocationsToBudgetLines(projectId, allocationLines)
      : [];

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

export async function markDrawPaid(
  id: string,
  projectId: string,
  amountReceived?: number,
  datePaid?: string
) {
  const supabase = createServerSupabaseClient();

  const { data: draw, error: fetchError } = await supabase
    .from("inv_owner_draws")
    .select("amount_requested, amount_paid")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const alreadyPaid = Number(draw.amount_paid) || 0;
  const outstanding = Math.max(0, (Number(draw.amount_requested) || 0) - alreadyPaid);
  const received = amountReceived ?? outstanding;
  if (!(received > 0)) throw new Error("Amount received must be greater than zero.");

  const { error } = await supabase
    .from("inv_owner_draws")
    .update({
      status: "paid",
      amount_paid: Math.round((alreadyPaid + received) * 100) / 100,
      date_paid: datePaid || new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function updateDrawStatus(id: string, projectId: string, status: DrawStatus) {
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: draw, error: fetchError } = await supabase
    .from("inv_owner_draws")
    .select("amount_requested, amount_paid, date_paid, date_approved")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const payload: Record<string, unknown> = { status };

  if (status === "paid") {
    if (!(Number(draw.amount_paid) > 0)) payload.amount_paid = draw.amount_requested;
    if (!draw.date_paid) payload.date_paid = today;
  }
  if (status === "approved" && !draw.date_approved) {
    payload.date_approved = today;
  }

  const { error } = await supabase.from("inv_owner_draws").update(payload).eq("id", id);
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

export async function getDrawFormContext(projectId: string): Promise<{
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
}> {
  const [budgetLines, allocations] = await Promise.all([
    getBudgetLinesForProject(projectId),
    getAllocationsForProject(projectId),
  ]);
  return { budgetLines, allocations };
}
