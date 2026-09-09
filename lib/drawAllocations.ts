// Pure diffing logic for saving a draw's schedule-of-values allocations —
// split out from app/draws/actions.ts (a "use server" file, which can't
// export a plain sync helper) so it's directly unit-testable. This is the
// exact logic that regressed in production on 2026-09-08: a naive "insert
// the new set, then delete whatever's stale" approach collides with the
// (draw_id, budget_line_id) unique constraint the moment a budget line stays
// allocated across an edit, which is the common case.

export interface ExistingAllocation {
  id: string;
  budget_line_id: string;
}

export interface NewAllocation {
  budget_line_id: string;
  amount: number;
}

export interface AllocationDiff {
  /** Every new allocation should be upserted on (draw_id, budget_line_id) —
   * never inserted blind — so a budget line still present just updates in
   * place instead of colliding with its existing row. */
  toUpsert: NewAllocation[];
  /** IDs of existing rows whose budget line is absent from the new set —
   * these are the only rows that should ever be deleted. */
  staleIds: string[];
}

export function diffAllocations(
  existing: ExistingAllocation[],
  newAllocations: NewAllocation[]
): AllocationDiff {
  const newBudgetLineIds = new Set(newAllocations.map((a) => a.budget_line_id));
  const staleIds = existing.filter((r) => !newBudgetLineIds.has(r.budget_line_id)).map((r) => r.id);
  return { toUpsert: newAllocations, staleIds };
}
