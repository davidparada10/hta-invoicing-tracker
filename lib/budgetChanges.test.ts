import { describe, expect, it } from "vitest";
import { diffBudgetFromG703 } from "@/lib/budgetChanges";

const line = (id: string, item: string, description: string, v: number) => ({
  id, item_number: item, description, scheduled_value: v,
});
const row = (item: string, description: string, scheduled_value: number) => ({
  item_number: item, category: null, description, scheduled_value, amount_this_period: 0,
});

describe("diffBudgetFromG703", () => {
  const lines = [line("a", "1", "Paving", 1000), line("b", "2", "Fencing", 500)];

  it("finds raised values and new lines, ignoring unchanged and zero cells", () => {
    const r = diffBudgetFromG703(
      [row("1", "Paving", 1200), row("2", "Fencing", 500), row("3", "CO 1 Gates", 80), row("9", "Blank", 0)],
      lines
    );
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]).toMatchObject({ budget_line_id: "a", current: 1000, proposed: 1200 });
    expect(r.added.map((a) => a.description)).toEqual(["CO 1 Gates"]);
    expect(r.warning).toBeNull();
  });

  it("does not zero out a line from a blank scheduled cell", () => {
    expect(diffBudgetFromG703([row("1", "Paving", 0)], lines).changed).toEqual([]);
  });

  it("matches by description before item number", () => {
    const r = diffBudgetFromG703([row("2", "Paving", 1300)], lines);
    expect(r.changed[0].budget_line_id).toBe("a");
  });

  it("offers nothing without an existing budget", () => {
    expect(diffBudgetFromG703([row("1", "Paving", 1200)], [])).toEqual({ changed: [], added: [], warning: null });
  });

  it("refuses a sweeping rewrite and says why", () => {
    const r = diffBudgetFromG703([row("1", "Paving", 9000), row("2", "Fencing", 9000)], lines);
    expect(r.changed).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.warning).toMatch(/too much/);
  });
});
