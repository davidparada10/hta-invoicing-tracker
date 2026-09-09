import { describe, expect, it } from "vitest";
import { diffAllocations } from "@/lib/drawAllocations";

describe("diffAllocations", () => {
  // This is the exact scenario that crashed production on 2026-09-08:
  // editing a draw that already has allocations for budget lines A and B,
  // keeping A (with a new amount), dropping B, and adding C. A plain insert
  // of the new set would collide with A's still-present row.
  it("keeps an existing budget line's row upsertable instead of colliding with it", () => {
    const existing = [
      { id: "row-a", budget_line_id: "line-a" },
      { id: "row-b", budget_line_id: "line-b" },
    ];
    const newAllocations = [
      { budget_line_id: "line-a", amount: 1500 }, // kept, amount changed
      { budget_line_id: "line-c", amount: 2000 }, // newly added
      // line-b dropped
    ];

    const { toUpsert, staleIds } = diffAllocations(existing, newAllocations);

    // Every new allocation must go through upsert — including line-a, which
    // still has an existing row. A plain insert here is what broke.
    expect(toUpsert).toEqual(newAllocations);
    // Only the genuinely-dropped budget line's row should be deleted.
    expect(staleIds).toEqual(["row-b"]);
  });

  it("deletes nothing when every existing budget line is still present", () => {
    const existing = [{ id: "row-a", budget_line_id: "line-a" }];
    const newAllocations = [{ budget_line_id: "line-a", amount: 999 }];
    expect(diffAllocations(existing, newAllocations).staleIds).toEqual([]);
  });

  it("marks every existing row stale when the new set is empty", () => {
    const existing = [
      { id: "row-a", budget_line_id: "line-a" },
      { id: "row-b", budget_line_id: "line-b" },
    ];
    const { toUpsert, staleIds } = diffAllocations(existing, []);
    expect(toUpsert).toEqual([]);
    expect(staleIds.sort()).toEqual(["row-a", "row-b"]);
  });

  it("has nothing stale when there was nothing existing", () => {
    const { staleIds } = diffAllocations([], [{ budget_line_id: "line-a", amount: 100 }]);
    expect(staleIds).toEqual([]);
  });
});
