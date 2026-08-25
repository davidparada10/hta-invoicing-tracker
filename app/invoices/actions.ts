"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function toNumber(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

export async function upsertSubInvoice(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = toNullableString(formData.get("id"));
  const projectId = formData.get("project_id") as string;

  const payload = {
    project_id: projectId,
    subcontractor_name: (formData.get("subcontractor_name") as string) ?? "",
    trade: toNullableString(formData.get("trade")),
    invoice_number: toNullableString(formData.get("invoice_number")),
    invoice_date: toNullableString(formData.get("invoice_date")),
    amount: toNumber(formData.get("amount")),
    retainage_held: toNumber(formData.get("retainage_held")),
    amount_paid: toNumber(formData.get("amount_paid")),
    date_paid: toNullableString(formData.get("date_paid")),
    status: formData.get("status") as string,
    notes: toNullableString(formData.get("notes")),
  };

  if (id) {
    const { error } = await supabase.from("inv_sub_invoices").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inv_sub_invoices").insert(payload);
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function deleteSubInvoice(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("inv_sub_invoices").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}
