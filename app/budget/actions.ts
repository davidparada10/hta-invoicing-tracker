"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseBudgetFromXlsx } from "@/lib/g702-parser";

function toNumber(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

export async function upsertBudgetLine(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = toNullableString(formData.get("id"));
  const projectId = formData.get("project_id") as string;

  const payload = {
    project_id: projectId,
    item_number: toNullableString(formData.get("item_number")),
    category: toNullableString(formData.get("category")),
    description: (formData.get("description") as string) ?? "",
    scheduled_value: toNumber(formData.get("scheduled_value")),
    retention_exempt: formData.get("retention_exempt") === "on",
  };

  if (id) {
    const { error } = await supabase.from("inv_project_budget_lines").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { data: max } = await supabase
      .from("inv_project_budget_lines")
      .select("sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (max?.sort_order ?? 0) + 1;

    const { error } = await supabase
      .from("inv_project_budget_lines")
      .insert({ ...payload, sort_order: nextSortOrder });
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBudgetLine(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("inv_project_budget_lines").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
}

const MAX_BUDGET_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — matches the G702 draw-upload cap

export async function importBudgetFromXlsx(
  formData: FormData
): Promise<{ count: number; total: number }> {
  const file = formData.get("budget_file");
  const projectId = formData.get("project_id") as string;
  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }
  if (!projectId) {
    throw new Error("Missing project.");
  }
  if (file.size > MAX_BUDGET_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max is 20MB.`
    );
  }

  const name = file.name.toLowerCase();
  if (
    !name.endsWith(".xlsx") &&
    !name.endsWith(".xls") &&
    !file.type.includes("spreadsheet") &&
    !file.type.includes("excel")
  ) {
    throw new Error("Unsupported file type. Please upload a .xlsx file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseBudgetFromXlsx(buffer);

  if (parsed.length === 0) {
    throw new Error(
      "Could not find a schedule of values in that file (expected a G703 continuation sheet)."
    );
  }

  const supabase = createServerSupabaseClient();

  // Match incoming rows to existing ones by item_number so a re-import updates
  // in place instead of delete-then-recreate. Recreating would assign new IDs,
  // and inv_draw_line_allocations cascades on budget_line_id deletion — so a
  // routine re-import (e.g. a corrected G703) would silently wipe every
  // draw's allocation history against lines that didn't actually change.
  const { data: existing, error: existingError } = await supabase
    .from("inv_project_budget_lines")
    .select("id, item_number, scheduled_value")
    .eq("project_id", projectId);
  if (existingError) throw existingError;

  const existingByItemNumber = new Map(
    (existing ?? []).filter((l) => l.item_number).map((l) => [l.item_number, l.id])
  );
  const matchedIds = new Set<string>();

  const rows = parsed.map((line, i) => ({
    item_number: line.item_number,
    category: line.category,
    description: line.description,
    scheduled_value: line.scheduled_value,
    sort_order: i + 1,
  }));

  // Sanity-check the parse before overwriting anything: a mis-parsed cell
  // (e.g. a shifted column reading $10 as $1,000,000) would otherwise
  // silently replace a plausible budget with a nonsensical one. Skip the
  // check on a project's first-ever import — there's nothing to compare against.
  const existingTotal = (existing ?? []).reduce((acc, l) => acc + (l.scheduled_value ?? 0), 0);
  const newTotal = rows.reduce((acc, r) => acc + r.scheduled_value, 0);
  const force = formData.get("force") === "true";
  if (existingTotal > 0 && !force && (newTotal > existingTotal * 5 || newTotal < existingTotal / 5)) {
    throw new Error(
      `MAGNITUDE_MISMATCH:${existingTotal}:${newTotal}:The new file totals ${newTotal.toLocaleString(
        "en-US",
        { style: "currency", currency: "USD" }
      )} vs. the current ${existingTotal.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} — that's a big enough swing it might be a parsing error. Double-check the file, or confirm to import anyway.`
    );
  }

  const toUpdate = rows
    .filter((r) => r.item_number && existingByItemNumber.has(r.item_number))
    .map((r) => ({ id: existingByItemNumber.get(r.item_number!)!, ...r }));
  const toInsert = rows.filter((r) => !r.item_number || !existingByItemNumber.has(r.item_number));

  for (const line of toUpdate) {
    matchedIds.add(line.id);
    const { id, ...payload } = line;
    const { error } = await supabase.from("inv_project_budget_lines").update(payload).eq("id", id);
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("inv_project_budget_lines")
      .insert(toInsert.map((r) => ({ project_id: projectId, ...r })));
    if (error) throw error;
  }

  // Only lines genuinely dropped from the new schedule get deleted (and,
  // correctly, cascade their allocations) — anything still present keeps its
  // ID and history.
  const staleIds = (existing ?? []).filter((l) => !matchedIds.has(l.id)).map((l) => l.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from("inv_project_budget_lines").delete().in("id", staleIds);
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}`);

  return {
    count: rows.length,
    total: rows.reduce((acc, r) => acc + r.scheduled_value, 0),
  };
}
