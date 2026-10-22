"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DrawDueType, ProjectStatus } from "@/lib/types";
import { isValidDrawDueDay } from "@/lib/drawSchedule";
import { getProjectClosingSummary } from "@/lib/data";
import type { ClosingSummary } from "@/lib/portfolio";

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
// "none" is the form's "No regular schedule" choice: no cadence is tracked (the
// same stored null as before) and the project is marked as deliberately
// unscheduled, which only the Data to review list reads.
export const NO_SCHEDULE_CHOICE = "none";

function resolveDrawDueFields(formData: FormData): {
  draw_due_type: DrawDueType | null;
  draw_due_day: number | null;
  waived: boolean;
} {
  const choice = toNullableString(formData.get("draw_due_type"));
  if (!choice) return { draw_due_type: null, draw_due_day: null, waived: false };
  if (choice === NO_SCHEDULE_CHOICE) return { draw_due_type: null, draw_due_day: null, waived: true };
  const drawDueType = choice as DrawDueType;

  const day = toNullableInt(formData.get("draw_due_day"));
  if (day === null || !isValidDrawDueDay(drawDueType, day)) {
    throw new Error(
      drawDueType === "day_of_month"
        ? "Day of month must be between 1 and 31."
        : "Weekday must be a valid day (Sunday-Saturday)."
    );
  }
  return { draw_due_type: drawDueType, draw_due_day: day, waived: false };
}

// Postgres reports a column that doesn't exist yet in these terms. Saving any
// other choice never touches that column, so only picking "No regular
// schedule" can hit it before the migration is applied.
function waivedColumnError(error: { message?: string } | null): Error | null {
  if (!error) return null;
  return /draw_schedule_waived/.test(error.message ?? "")
    ? new Error(
        "\"No regular schedule\" needs a one-time database update that hasn't been applied yet. Ask for it to be applied, or pick another cadence."
      )
    : (error as unknown as Error);
}

export async function createProject(formData: FormData): Promise<{ id: string }> {
  const supabase = createServerSupabaseClient();

  const { waived, ...drawDue } = resolveDrawDueFields(formData);
  const payload = {
    name: requireName(formData.get("name")),
    // No longer collected in the UI — the column is still unique/required
    // in the database, so generate a value that'll never collide instead.
    project_number: crypto.randomUUID(),
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    developer: toNullableString(formData.get("developer")),
    status: resolveStatus((formData.get("status") as string) || "active"),
    ...drawDue,
    // Written only when true, so every other save works before the migration.
    ...(waived ? { draw_schedule_waived: true } : {}),
  };

  const { data, error } = await supabase
    .from("inv_projects")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw waivedColumnError(error);

  revalidatePath("/");
  return { id: data.id as string };
}

export async function updateProject(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = formData.get("id") as string;

  const { waived, ...drawDue } = resolveDrawDueFields(formData);
  // Clearing the flag is written only when it is currently set, so saving an
  // ordinary project never touches a column that may not exist yet.
  const { data: current } = await supabase
    .from("inv_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const clearWaived = !waived && current?.draw_schedule_waived === true;
  const payload = {
    name: requireName(formData.get("name")),
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    developer: toNullableString(formData.get("developer")),
    draw_skip_month: toNullableMonth(formData.get("draw_skip_month")),
    status: resolveStatus(formData.get("status") as string | null),
    ...drawDue,
    ...(waived ? { draw_schedule_waived: true } : clearWaived ? { draw_schedule_waived: false } : {}),
  };

  const { error } = await supabase.from("inv_projects").update(payload).eq("id", id);
  if (error) throw waivedColumnError(error);

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

// Read-only: what is still collectible and still held on a project, shown
// before it is closed. Closing itself never changes a draw or a receipt.
export async function previewProjectClose(id: string): Promise<ClosingSummary> {
  return getProjectClosingSummary(id);
}
