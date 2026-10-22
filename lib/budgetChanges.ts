// Compares the schedule of values in an uploaded G703 with the project's
// budget lines, so a change order (a raised scheduled value, or a brand-new
// line) can be offered for review when a draw is uploaded. Pure functions: the
// caller decides what to apply, and nothing here writes anything.

import type { ScannedG703Row } from "@/lib/g702-parser";

const CENT = 0.005;

export function normalizeMatchKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Maps a key to a budget line id only when the key is unique across all
// lines — an ambiguous key (e.g. duplicate item numbers on unrelated line
// items) is left out entirely rather than guessing and misfiling an amount.
export function buildUniqueMatchMap(pairs: [string, string][]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const [key] of pairs) counts.set(key, (counts.get(key) ?? 0) + 1);
  const map = new Map<string, string>();
  for (const [key, id] of pairs) {
    if (key && counts.get(key) === 1) map.set(key, id);
  }
  return map;
}

export interface ExistingBudgetLine {
  id: string;
  item_number: string | null;
  description: string;
  scheduled_value: number;
}

export interface BudgetLineChange {
  /** Stable key the review UI and the apply step use to refer to this change. */
  key: string;
  budget_line_id: string;
  item_number: string | null;
  description: string;
  current: number;
  proposed: number;
}

export interface BudgetLineAddition {
  key: string;
  item_number: string | null;
  category: string | null;
  description: string;
  scheduled_value: number;
}

export interface BudgetChanges {
  changed: BudgetLineChange[];
  added: BudgetLineAddition[];
  /** Set when the file's schedule looks wrong (so nothing should be offered). */
  warning: string | null;
}

export const NO_BUDGET_CHANGES: BudgetChanges = { changed: [], added: [], warning: null };

export function matchBudgetLine(
  row: { item_number: string; description: string },
  lines: ExistingBudgetLine[]
): string | undefined {
  const byDescription = buildUniqueMatchMap(lines.map((l) => [normalizeMatchKey(l.description), l.id]));
  const byItemNumber = buildUniqueMatchMap(
    lines.filter((l) => l.item_number).map((l) => [normalizeMatchKey(l.item_number!), l.id])
  );
  return (
    byDescription.get(normalizeMatchKey(row.description)) ??
    byItemNumber.get(normalizeMatchKey(row.item_number))
  );
}

export function diffBudgetFromG703(rows: ScannedG703Row[], lines: ExistingBudgetLine[]): BudgetChanges {
  // Nothing to compare against: the project's first schedule goes in through
  // the Budget tab's import, not through a draw upload.
  if (lines.length === 0 || rows.length === 0) return NO_BUDGET_CHANGES;

  const byId = new Map(lines.map((l) => [l.id, l]));
  const byDescription = buildUniqueMatchMap(lines.map((l) => [normalizeMatchKey(l.description), l.id]));
  const byItemNumber = buildUniqueMatchMap(
    lines.filter((l) => l.item_number).map((l) => [normalizeMatchKey(l.item_number!), l.id])
  );

  const changed: BudgetLineChange[] = [];
  const added: BudgetLineAddition[] = [];
  const seenLine = new Set<string>();
  rows.forEach((r, i) => {
    const id =
      byDescription.get(normalizeMatchKey(r.description)) ?? byItemNumber.get(normalizeMatchKey(r.item_number));
    if (id) {
      const line = byId.get(id)!;
      // A zero scheduled value is far more likely a blank or misread cell than
      // a line being zeroed out, and the same line twice is ambiguous: skip both.
      if (r.scheduled_value <= CENT || seenLine.has(id)) return;
      seenLine.add(id);
      if (Math.abs(r.scheduled_value - line.scheduled_value) > CENT) {
        changed.push({
          key: `line:${id}`,
          budget_line_id: id,
          item_number: line.item_number,
          description: line.description,
          current: line.scheduled_value,
          proposed: r.scheduled_value,
        });
      }
    } else if (r.scheduled_value > CENT) {
      added.push({
        key: `new:${i}`,
        item_number: r.item_number || null,
        category: r.category,
        description: r.description,
        scheduled_value: r.scheduled_value,
      });
    }
  });

  // A mis-read column (say a shifted one) would show as a sweeping rewrite;
  // refuse to offer it rather than let one click apply it.
  const total = lines.reduce((a, l) => a + l.scheduled_value, 0);
  const proposedTotal =
    total +
    changed.reduce((a, c) => a + (c.proposed - c.current), 0) +
    added.reduce((a, l) => a + l.scheduled_value, 0);
  const sweeping = changed.length > Math.max(5, lines.length / 2);
  const magnitude = total > 0 && (proposedTotal > total * 2 || proposedTotal < total / 2);
  if (sweeping || magnitude) {
    return {
      changed: [],
      added: [],
      warning:
        "This file's schedule of values differs from the budget by too much to be a change order (" +
        `${changed.length} changed, ${added.length} new lines), so no budget changes are offered. ` +
        "If it is correct, update the budget from the Budget tab's import.",
    };
  }
  return { changed, added, warning: null };
}
