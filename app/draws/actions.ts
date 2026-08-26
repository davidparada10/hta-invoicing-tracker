"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseG702FromXlsx, ParsedG702Draw } from "@/lib/g702-parser";

export async function parseG702Upload(formData: FormData): Promise<ParsedG702Draw> {
  const file = formData.get("g702_file");
  if (!(file instanceof File)) {
    throw new Error("No file provided.");
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
  return parseG702FromXlsx(buffer);
}

function toNumber(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

export async function upsertDraw(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = toNullableString(formData.get("id"));
  const projectId = formData.get("project_id") as string;

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

  if (id) {
    const { error } = await supabase.from("inv_owner_draws").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inv_owner_draws").insert(payload);
    if (error) throw error;
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
