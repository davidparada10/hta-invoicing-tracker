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

// <input type="month"> gives "YYYY-MM"; stored as that month's first day so
// it's an ordinary date column, not a separate year/month pair.
function toNullableMonth(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : null;
}

const STATUSES: ProjectStatus[] = ["active", "closed"];

// Shared by createProject/updateProject/updateProjectStatus. The status
// <select>/toggle already constrains this client-side, but that's not
// trustworthy on its own — an invalid value here wouldn't error, it'd just
// silently write garbage into inv_projects.status.
function resolveStatus(value: string | null): ProjectStatus {
  if (!STATUSES.includes(value as ProjectStatus)) {
    throw new Error("Invalid project status.");
  }
  return value as ProjectStatus;
}

function requireName(value: FormDataEntryValue | null): string {
  const name = (value ?? "").toString().trim();
  if (!name) throw new Error("Project name is required.");
  return name;
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
    name: requireName(formData.get("name")),
    // No longer collected in the UI — the column is still unique/required
    // in the database, so generate a value that'll never collide instead.
    project_number: crypto.randomUUID(),
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    developer: toNullableString(formData.get("developer")),
    status: resolveStatus((formData.get("status") as string) || "active"),
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
    name: requireName(formData.get("name")),
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    developer: toNullableString(formData.get("developer")),
    draw_skip_month: toNullableMonth(formData.get("draw_skip_month")),
    status: resolveStatus(formData.get("status") as string | null),
    ...resolveDrawDueFields(formData),
  };

  const { error } = await supabase.from("inv_projects").update(payload).eq("id", id);
  if (error) throw error;

  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
}

export async function updateProjectStatus(id: string, status: ProjectStatus) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("inv_projects")
    .update({ status: resolveStatus(status) })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
}
