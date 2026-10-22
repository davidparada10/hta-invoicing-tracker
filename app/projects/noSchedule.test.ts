import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { updateProject, createProject } = await import("@/app/projects/actions");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = { id: "p1", name: "Alpha", status: "active" };

describe("No regular schedule", () => {
  beforeEach(() => {
    tables = {
      inv_projects: [{ id: "p1", name: "Alpha", status: "active", draw_due_type: "day_of_month", draw_due_day: 30 }],
    };
  });

  it("marks the project as deliberately unscheduled and clears the cadence", async () => {
    await updateProject(form({ ...base, draw_due_type: "none" }));
    expect(tables.inv_projects[0]).toMatchObject({
      draw_due_type: null,
      draw_due_day: null,
      draw_schedule_waived: true,
    });
  });

  it("an ordinary save never writes the column (safe before the migration is applied)", async () => {
    await updateProject(form({ ...base, draw_due_type: "day_of_month", draw_due_day: "15" }));
    expect(tables.inv_projects[0]).toMatchObject({ draw_due_type: "day_of_month", draw_due_day: 15 });
    expect("draw_schedule_waived" in tables.inv_projects[0]).toBe(false);
    await updateProject(form({ ...base, draw_due_type: "" }));
    expect("draw_schedule_waived" in tables.inv_projects[0]).toBe(false);
  });

  it("choosing a cadence again clears the flag", async () => {
    tables.inv_projects[0].draw_schedule_waived = true;
    await updateProject(form({ ...base, draw_due_type: "last_weekday", draw_due_day: "4" }));
    expect(tables.inv_projects[0]).toMatchObject({ draw_due_type: "last_weekday", draw_schedule_waived: false });
  });

  it("'Not set yet' also clears a previous no-schedule choice", async () => {
    tables.inv_projects[0].draw_schedule_waived = true;
    await updateProject(form({ ...base, draw_due_type: "" }));
    expect(tables.inv_projects[0].draw_schedule_waived).toBe(false);
  });

  it("a new project can be created with no regular schedule", async () => {
    tables.inv_projects = [];
    await createProject(form({ name: "Beta", draw_due_type: "none" }));
    expect(tables.inv_projects[0]).toMatchObject({ name: "Beta", draw_due_type: null, draw_schedule_waived: true });
  });
});
