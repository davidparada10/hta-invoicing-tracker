// Recurring draw-due-date helpers — kept pure/client-safe like lib/aging.ts.
//
// A project's cadence is either a fixed day-of-month or the last occurrence
// of a weekday in the month. "Overdue" means the cycle's due date has
// passed and no draw (any status) covers the current calendar month yet —
// the bar is just "does a draft/draw exist for this period," not that it's
// been submitted.
//
// A draw's period_end (falling back to date_submitted, then created_at for
// the rare row with neither) decides which cycle it belongs to — NOT when
// the record was created. A draw for August finally drafted two days into
// September must not silently satisfy September's cadence just because its
// created_at happens to land there.

import { Project, OwnerDraw } from "@/lib/types";

type ScheduleFields = Pick<Project, "draw_due_type" | "draw_due_day">;
type CycleFields = Pick<OwnerDraw, "period_end" | "date_submitted" | "created_at">;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const diff = (last.getDay() - weekday + 7) % 7;
  last.setDate(last.getDate() - diff);
  return last;
}

/** This cycle's (current calendar month) draw due date, or null with no fixed cadence. */
export function getDrawDueDate(
  project: ScheduleFields,
  referenceDate: Date = new Date()
): Date | null {
  if (!project.draw_due_type || project.draw_due_day == null) return null;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  if (project.draw_due_type === "day_of_month") {
    const day = Math.min(project.draw_due_day, lastDayOfMonth(year, month));
    return new Date(year, month, day);
  }
  return lastWeekdayOfMonth(year, month, project.draw_due_day);
}

/**
 * Human label for this cycle's actual due date, e.g. "Due Sep 25" — a
 * "last weekday" cadence resolves to the real calendar date rather than a
 * generic "Due last Thursday" the reader would have to work out themselves.
 */
export function drawDueLabel(
  project: ScheduleFields,
  referenceDate: Date = new Date()
): string | null {
  const dueDate = getDrawDueDate(project, referenceDate);
  if (!dueDate) return null;
  return `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// period_end/date_submitted are bare "YYYY-MM-DD" with no timezone — parsed
// as-is that's UTC midnight, which shifts to the previous day (and
// potentially the previous month) in any timezone behind UTC. created_at is
// already a full timestamp with its own offset, so leave it alone.
function parseDateOnly(value: string): Date {
  return new Date(value.length <= 10 ? `${value}T00:00:00` : value);
}

function drawCycleDate(d: CycleFields): Date {
  return parseDateOnly(d.period_end ?? d.date_submitted ?? d.created_at);
}

function hasDrawForCycle(projectDraws: CycleFields[], referenceDate: Date): boolean {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  return projectDraws.some((d) => {
    const date = drawCycleDate(d);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

/** Days until this cycle's due date (negative once past it), or null with no cadence. */
export function daysUntilDrawDue(
  project: ScheduleFields,
  referenceDate: Date = new Date()
): number | null {
  const dueDate = getDrawDueDate(project, referenceDate);
  if (!dueDate) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(referenceDate).getTime()) / msPerDay
  );
}

/**
 * True once this cycle's due date has passed with no draw (any status)
 * covering the current calendar month yet.
 */
export function isDrawOverdue(
  project: ScheduleFields,
  projectDraws: CycleFields[],
  referenceDate: Date = new Date()
): boolean {
  const daysUntil = daysUntilDrawDue(project, referenceDate);
  if (daysUntil === null || daysUntil > 0) return false;
  return !hasDrawForCycle(projectDraws, referenceDate);
}

/**
 * True from `warnDaysBefore` days ahead of the due date through overdue,
 * as long as no draw covers this cycle yet — the "act now" window shown as
 * a stronger visual warning than the plain due-date label.
 */
export function isDrawUrgent(
  project: ScheduleFields,
  projectDraws: CycleFields[],
  referenceDate: Date = new Date(),
  warnDaysBefore: number = 5
): boolean {
  const daysUntil = daysUntilDrawDue(project, referenceDate);
  if (daysUntil === null || daysUntil > warnDaysBefore) return false;
  return !hasDrawForCycle(projectDraws, referenceDate);
}
