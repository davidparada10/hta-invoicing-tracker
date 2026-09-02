"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProjectStatus } from "@/lib/types";

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

function toNullableInt(value: FormDataEntryValue | null): number | null {
  const s = (value ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createProject(formData: FormData): Promise<{ id: string }> {
  const supabase = createServerSupabaseClient();

  const payload = {
    name: (formData.get("name") as string) ?? "",
    // No longer collected in the UI — the column is still unique/required
    // in the database, so generate a value that'll never collide instead.
    project_number: crypto.randomUUID(),
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    status: (formData.get("status") as string) || "active",
  };

  const { data, error } = await supabase
    .from("inv_projects")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/");
  return { id: data.id as string };
}

export async function updateProject(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = formData.get("id") as string;

  const drawDueType = toNullableString(formData.get("draw_due_type"));

  const payload = {
    name: (formData.get("name") as string) ?? "",
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    status: formData.get("status") as string,
    draw_due_type: drawDueType,
    draw_due_day: drawDueType ? toNullableInt(formData.get("draw_due_day")) : null,
  };

  const { error } = await supabase.from("inv_projects").update(payload).eq("id", id);
  if (error) throw error;

  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
}

export async function updateProjectStatus(id: string, status: ProjectStatus) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("inv_projects").update({ status }).eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
}
