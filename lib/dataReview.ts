// Read-only data-quality checks shown on the dashboard. Nothing here changes a
// record: each item points at something a person should look at and fix by
// hand. Pure functions over already-loaded rows so they are unit-tested.

import type { BudgetLine, DrawLineAllocation, OwnerDraw, Project } from "@/lib/types";

export type ReviewKind =
  | "missing_cadence"
  | "over_budget_line"
  | "missing_submitted"
  | "paid_before_submitted"
  | "slow_payment";

export interface ReviewItem {
  kind: ReviewKind;
  projectId: string;
  projectName: string;
  /** What to look at, e.g. "Draw #12" or a budget line name. */
  subject: string;
  detail: string;
}

export const REVIEW_LABELS: Record<ReviewKind, { title: string; hint: string }> = {
  missing_cadence: {
    title: "Active projects with no draw schedule",
    hint: "No draw-due reminders are shown for these. Set a cadence, or choose \"No regular schedule\" in Edit Project if that is intentional.",
  },
  over_budget_line: {
    title: "Budget lines billed past their scheduled value",
    hint: "Usually a change order that was never added to the budget.",
  },
  missing_submitted: {
    title: "Draws with no submitted date",
    hint: "Days outstanding and days-to-pay can't be worked out.",
  },
  paid_before_submitted: {
    title: "Paid before submitted",
    hint: "One of the two dates is probably a typo.",
  },
  slow_payment: {
    title: "Paid more than 120 days after submitting",
    hint: "Real, or a wrong date. Skews average days to pay.",
  },
};

export const REVIEW_ORDER = Object.keys(REVIEW_LABELS) as ReviewKind[];

const CENT = 0.005;
const SLOW_PAYMENT_DAYS = 120;

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 86_400_000);
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function dataReviewItems(input: {
  projects: Project[];
  draws: OwnerDraw[];
  budgetLines: BudgetLine[];
  allocations: Pick<DrawLineAllocation, "draw_id" | "budget_line_id" | "amount">[];
}): ReviewItem[] {
  const { projects, draws, budgetLines, allocations } = input;
  const items: ReviewItem[] = [];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const item = (
    kind: ReviewKind,
    project: Project,
    subject: string,
    detail: string
  ): ReviewItem => ({ kind, projectId: project.id, projectName: project.name, subject, detail });

  for (const p of projects) {
    if (p.status === "active" && !p.draw_due_type && !p.draw_schedule_waived) {
      items.push(item("missing_cadence", p, "Draw schedule", "Not set"));
    }
  }

  const liveDraws = draws.filter((d) => !d.deleted_at);
  for (const d of liveDraws) {
    const p = byId.get(d.project_id);
    if (!p || d.status === "draft") continue;
    const label = `Draw #${d.draw_number}`;
    if (!d.date_submitted) {
      items.push(item("missing_submitted", p, label, "No submitted date"));
      continue;
    }
    if (d.date_paid) {
      const wait = daysBetween(d.date_submitted, d.date_paid);
      if (wait < 0) {
        items.push(
          item("paid_before_submitted", p, label, `Paid ${d.date_paid}, submitted ${d.date_submitted}`)
        );
      } else if (wait > SLOW_PAYMENT_DAYS) {
        items.push(
          item("slow_payment", p, label, `${wait} days from ${d.date_submitted} to ${d.date_paid}`)
        );
      }
    }
  }

  // Billed per line over non-draft, live draws (a draft isn't billed yet).
  const liveNonDraft = new Set(liveDraws.filter((d) => d.status !== "draft").map((d) => d.id));
  const billed = new Map<string, number>();
  for (const a of allocations) {
    if (!liveNonDraft.has(a.draw_id)) continue;
    billed.set(a.budget_line_id, (billed.get(a.budget_line_id) ?? 0) + a.amount);
  }
  for (const l of budgetLines) {
    if (l.deleted_at) continue;
    const p = byId.get(l.project_id);
    const over = (billed.get(l.id) ?? 0) - l.scheduled_value;
    if (p && over > CENT + 0.005) {
      items.push(item("over_budget_line", p, l.description, `${usd(over)} over its scheduled value`));
    }
  }

  return items.sort(
    (a, b) =>
      REVIEW_ORDER.indexOf(a.kind) - REVIEW_ORDER.indexOf(b.kind) ||
      a.projectName.localeCompare(b.projectName) ||
      a.subject.localeCompare(b.subject, undefined, { numeric: true })
  );
}
