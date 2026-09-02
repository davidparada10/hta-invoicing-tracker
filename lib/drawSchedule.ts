// Recurring draw-due-date helpers — kept pure/client-safe like lib/aging.ts.
//
// A project's cadence is either a fixed day-of-month or the last occurrence
// of a weekday in the month. "Overdue" means the cycle's due date has
// passed and no draw (any status) has been created since the start of the
// current calendar month — the bar is just "does a draft/draw exist yet,"
// not that it's been submitted.

import { Project, OwnerDraw } from "@/lib/types";

type ScheduleFields = Pick<Project, "draw_due_type" | "draw_due_day">;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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

/** Human label for a project's cadence, e.g. "Due the 25th" / "Due last Thursday". */
export function drawDueLabel(project: ScheduleFields): string | null {
  if (!project.draw_due_type || project.draw_due_day == null) return null;
  if (project.draw_due_type === "day_of_month") {
    return `Due the ${ordinal(project.draw_due_day)}`;
  }
  return `Due last ${WEEKDAY_NAMES[project.draw_due_day]}`;
}

function hasDrawSinceCycleStart(
  projectDraws: Pick<OwnerDraw, "created_at">[],
  referenceDate: Date
): boolean {
  const cycleStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return projectDraws.some((d) => new Date(d.created_at).getTime() >= cycleStart.getTime());
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
 * created since the start of the current calendar month.
 */
export function isDrawOverdue(
  project: ScheduleFields,
  projectDraws: Pick<OwnerDraw, "created_at">[],
  referenceDate: Date = new Date()
): boolean {
  const daysUntil = daysUntilDrawDue(project, referenceDate);
  if (daysUntil === null || daysUntil > 0) return false;
  return !hasDrawSinceCycleStart(projectDraws, referenceDate);
}

/**
 * True from `warnDaysBefore` days ahead of the due date through overdue,
 * as long as no draw has been created yet this cycle — the "act now"
 * window shown as a stronger visual warning than the plain due-date label.
 */
export function isDrawUrgent(
  project: ScheduleFields,
  projectDraws: Pick<OwnerDraw, "created_at">[],
  referenceDate: Date = new Date(),
  warnDaysBefore: number = 5
): boolean {
  const daysUntil = daysUntilDrawDue(project, referenceDate);
  if (daysUntil === null || daysUntil > warnDaysBefore) return false;
  return !hasDrawSinceCycleStart(projectDraws, referenceDate);
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}
