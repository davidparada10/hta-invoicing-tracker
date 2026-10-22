import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { applyBudgetChangesFromDrawFile } = await import("@/app/budget/actions");
const { parseG702Upload } = await import("@/app/draws/actions");

function g703(rows: [string, string, number, number][]): File {
  const aoa: unknown[][] = [
    ["ITEM", "DESCRIPTION OF WORK", "REVISED CONTRACT AMT", "THIS PERIOD"],
    [null, "Site Work", null, null],
    ...rows,
    [null, "TOTAL", null, null],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "G703");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buf)], "draw.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function seed() {
  tables = {
    inv_project_budget_lines: [
      { id: "l1", project_id: "p", item_number: "1", category: "Site Work", description: "Paving", scheduled_value: 100000, sort_order: 1, deleted_at: null },
      { id: "l2", project_id: "p", item_number: "2", category: "Site Work", description: "Fencing", scheduled_value: 50000, sort_order: 2, deleted_at: null },
    ],
  };
}

function form(file: File, keys: string[], projectId = "p") {
  const fd = new FormData();
  fd.set("g702_file", file);
  fd.set("project_id", projectId);
  fd.set("keys", JSON.stringify(keys));
  return fd;
}

describe("draw upload budget changes", () => {
  beforeEach(seed);

  const file = () =>
    g703([
      ["1", "Paving", 112000, 5000], // change order +12,000
      ["2", "Fencing", 50000, 0], // unchanged
      ["3", "Change Order 1 - Gates", 8000, 2000], // new line
    ]);

  it("offers changes without writing anything", async () => {
    const fd = new FormData();
    fd.set("g702_file", file());
    fd.set("project_id", "p");
    const parsed = await parseG702Upload(fd);
    expect(parsed.budgetChanges.changed).toMatchObject([{ budget_line_id: "l1", current: 100000, proposed: 112000 }]);
    expect(parsed.budgetChanges.added).toMatchObject([{ description: "Change Order 1 - Gates", scheduled_value: 8000 }]);
    expect(tables.inv_project_budget_lines).toHaveLength(2);
    expect(tables.inv_project_budget_lines[0].scheduled_value).toBe(100000);
  });

  it("applies only the ticked changes, keeping ids and appending new lines", async () => {
    const f = file();
    const fd = new FormData();
    fd.set("g702_file", f);
    fd.set("project_id", "p");
    const parsed = await parseG702Upload(fd);
    const changeKey = parsed.budgetChanges.changed[0].key;
    const result = await applyBudgetChangesFromDrawFile(form(f, [changeKey]));
    expect(result).toEqual({ updated: 1, inserted: 0 });
    expect(tables.inv_project_budget_lines.find((l) => l.id === "l1")?.scheduled_value).toBe(112000);
    expect(tables.inv_project_budget_lines).toHaveLength(2);

    const addKey = parsed.budgetChanges.added[0].key;
    const second = await applyBudgetChangesFromDrawFile(form(f, [addKey]));
    expect(second).toEqual({ updated: 0, inserted: 1 });
    expect(tables.inv_project_budget_lines).toHaveLength(3);
    expect(tables.inv_project_budget_lines[2]).toMatchObject({
      description: "Change Order 1 - Gates",
      scheduled_value: 8000,
      sort_order: 3,
      project_id: "p",
    });
  });

  it("rejects keys that are not in the file's changes", async () => {
    await expect(applyBudgetChangesFromDrawFile(form(file(), ["line:nope"]))).rejects.toThrow(/changed since/);
    expect(tables.inv_project_budget_lines[0].scheduled_value).toBe(100000);
  });

  it("offers nothing when the project has no budget yet", async () => {
    tables.inv_project_budget_lines = [];
    const fd = new FormData();
    fd.set("g702_file", file());
    fd.set("project_id", "p");
    const parsed = await parseG702Upload(fd);
    expect(parsed.budgetChanges).toEqual({ changed: [], added: [], warning: null });
  });
});
