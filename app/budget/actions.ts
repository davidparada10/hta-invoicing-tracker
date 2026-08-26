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

  const { error: deleteError } = await supabase
    .from("inv_project_budget_lines")
    .delete()
    .eq("project_id", projectId);
  if (deleteError) throw deleteError;

  const rows = parsed.map((line, i) => ({
    project_id: projectId,
    item_number: line.item_number,
    category: line.category,
    description: line.description,
    scheduled_value: line.scheduled_value,
    sort_order: i + 1,
  }));

  const { error: insertError } = await supabase.from("inv_project_budget_lines").insert(rows);
  if (insertError) throw insertError;

  revalidatePath(`/projects/${projectId}`);

  return {
    count: rows.length,
    total: rows.reduce((acc, r) => acc + r.scheduled_value, 0),
  };
}
