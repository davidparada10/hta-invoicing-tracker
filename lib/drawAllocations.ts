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

// True only when the schedule-of-values total is off from requested +
// retainage by more than one cent. Compared in whole cents: a plain
// `Math.abs(a - b) > 0.01` on floats reads a true one-cent gap as
// 0.0100000000093 and fires a spurious mismatch warning on draws whose
// per-line amounts each round to the cent.
export function allocationExceedsTolerance(
  allocated: number,
  requested: number,
  retainage: number
): boolean {
  const diffCents = Math.abs(Math.round(allocated * 100) - Math.round((requested + retainage) * 100));
  return diffCents > 1;
}

// The draw form's in-progress line-amount state — budget_line_id → amount
// as a string (how the amount input renders), not yet saved.
export type LineAmounts = Record<string, string>;

// How a parsed upload's allocations combine into the form's in-progress
// line amounts. "replace" is the default/intended behavior for a revised
// document: a budget line the new file doesn't mention is cleared, not left
// at its old value. "merge" is the previous (accidental-default) overlay
// behavior, kept as an explicit opt-in for the rare case someone genuinely
// wants to layer a partial document on top of what's already entered.
export function applyParsedAllocations(
  prev: LineAmounts,
  parsed: NewAllocation[],
  mode: "replace" | "merge"
): LineAmounts {
  const next = mode === "merge" ? { ...prev } : {};
  for (const a of parsed) next[a.budget_line_id] = String(a.amount);
  return next;
}
