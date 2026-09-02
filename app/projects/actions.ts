"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DrawDueType, ProjectStatus } from "@/lib/types";
import { isValidDrawDueDay } from "@/lib/drawSchedule";

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

// Shared by createProject/updateProject. The Edit/Add Project forms already
// constrain draw_due_day via <select>/min/max, but that's client-side only —
// validate again here rather than trusting it, since a bad value doesn't
// error downstream, it silently resolves to a nonsense due date.
function resolveDrawDueFields(formData: FormData): {
  draw_due_type: DrawDueType | null;
  draw_due_day: number | null;
} {
  const drawDueType = toNullableString(formData.get("draw_due_type")) as DrawDueType | null;
  if (!drawDueType) return { draw_due_type: null, draw_due_day: null };

  const day = toNullableInt(formData.get("draw_due_day"));
  if (day === null || !isValidDrawDueDay(drawDueType, day)) {
    throw new Error(
      drawDueType === "day_of_month"
        ? "Day of month must be between 1 and 31."
        : "Weekday must be a valid day (Sunday-Saturday)."
    );
  }
  return { draw_due_type: drawDueType, draw_due_day: day };
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
    ...resolveDrawDueFields(formData),
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

  const payload = {
    name: (formData.get("name") as string) ?? "",
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    status: formData.get("status") as string,
    ...resolveDrawDueFields(formData),
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
