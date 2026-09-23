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

function toNullableNumber(value: FormDataEntryValue | null): number | null {
  const s = (value ?? "").toString().trim();
  if (!s.length) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
    retention_rate_override: toNullableNumber(formData.get("retention_rate_override")),
    excluded_from_contract: formData.get("excluded_from_contract") === "on",
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
  const { error } = await supabase
    .from("inv_project_budget_lines")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
}

export async function restoreBudgetLine(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("inv_project_budget_lines")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
}

const MAX_BUDGET_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — matches the G702 draw-upload cap

export async function importBudgetFromXlsx(
  formData: FormData
): Promise<{ updated: number; inserted: number; total: number }> {
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

  // Match incoming rows to existing ones so a re-import updates in place
  // instead of delete-then-recreate. Recreating would assign new IDs, and
  // inv_draw_line_allocations cascades on budget_line_id deletion — so a
  // routine re-import (e.g. a corrected G703) would silently wipe every
  // draw's allocation history against lines that didn't actually change.
  //
  // item_number alone isn't a safe key: these sheets restart numbering
  // per category (item "1" in "Electrical" and item "1" in "General
  // Requirements" are unrelated lines), so item_number+category+description
  // is used instead — and a key that isn't unique on the existing side is
  // left unmatched entirely rather than guessing, since guessing wrong
  // means silently overwriting an unrelated line's value.
  const { data: existing, error: existingError } = await supabase
    .from("inv_project_budget_lines")
    .select("id, item_number, category, description, scheduled_value, sort_order")
    .eq("project_id", projectId);
  if (existingError) throw existingError;

  function matchKey(l: { item_number: string | null; category: string | null; description: string }): string {
    return [l.item_number ?? "", l.category ?? "", l.description]
      .map((s) => s.trim().toLowerCase())
      .join("|");
  }

  const existingKeyCounts = new Map<string, number>();
  for (const l of existing ?? []) {
    const key = matchKey(l);
    existingKeyCounts.set(key, (existingKeyCounts.get(key) ?? 0) + 1);
  }
  const existingByKey = new Map<string, string>();
  for (const l of existing ?? []) {
    const key = matchKey(l);
    if (l.item_number && existingKeyCounts.get(key) === 1) existingByKey.set(key, l.id);
  }
  const rows = parsed.map((line) => ({
    item_number: line.item_number,
    category: line.category,
    description: line.description,
    scheduled_value: line.scheduled_value,
  }));

  // Sanity-check the parse before writing anything: a mis-parsed cell (e.g.
  // a shifted column reading $10 as $1,000,000) would otherwise silently
  // land a nonsensical value. Also catches uploading a small partial sheet
  // (a change-order addendum, a single draw's continuation sheet) by
  // mistake — its total will look tiny next to the real budget. Skip the
  // check on a project's first-ever import — there's nothing to compare against.
  const existingTotal = (existing ?? []).reduce((acc, l) => acc + (l.scheduled_value ?? 0), 0);
  const newTotal = rows.reduce((acc, r) => acc + r.scheduled_value, 0);
  const force = formData.get("force") === "true";
  if (existingTotal > 0 && !force && (newTotal > existingTotal * 5 || newTotal < existingTotal / 5)) {
    throw new Error(
      `MAGNITUDE_MISMATCH:${existingTotal}:${newTotal}:This file totals ${newTotal.toLocaleString(
        "en-US",
        { style: "currency", currency: "USD" }
      )} vs. the existing schedule's ${existingTotal.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} — that's a big enough swing it might be a parsing error, or a partial file (like a single draw's sheet) rather than the full schedule of values. Double-check before continuing.`
    );
  }

  // Matched lines are updated in place, keeping their existing sort_order —
  // reassigning it from the uploaded file's row order would scramble the
  // display order of every line the file doesn't mention. New lines are
  // appended after whatever's already there.
  const toUpdate = rows
    .filter((r) => r.item_number && existingByKey.has(matchKey(r)))
    .map((r) => ({ id: existingByKey.get(matchKey(r))!, ...r }));
  const maxSortOrder = (existing ?? []).reduce((acc, l) => Math.max(acc, l.sort_order ?? 0), 0);
  const toInsert = rows
    .filter((r) => !r.item_number || !existingByKey.has(matchKey(r)))
    .map((r, i) => ({ ...r, sort_order: maxSortOrder + i + 1 }));

  for (const line of toUpdate) {
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

  // Deliberately no delete pass here: a re-import only adds/updates lines it
  // recognizes. A line genuinely retired from the contract is removed by
  // hand (which soft-deletes to the Trash tab) — safer than trusting every
  // future upload to be a complete, authoritative schedule of values.
  revalidatePath(`/projects/${projectId}`);

  // The file's own total no longer equals the project's total now that a
  // partial file doesn't replace the whole schedule — report what this
  // import actually changed instead.
  const prevMatchedTotal = new Set(toUpdate.map((r) => r.id));
  const resultingTotal =
    (existing ?? []).reduce((acc, l) => acc + (prevMatchedTotal.has(l.id) ? 0 : l.scheduled_value ?? 0), 0) +
    toUpdate.reduce((acc, r) => acc + r.scheduled_value, 0) +
    toInsert.reduce((acc, r) => acc + r.scheduled_value, 0);

  return {
    updated: toUpdate.length,
    inserted: toInsert.length,
    total: resultingTotal,
  };
}
