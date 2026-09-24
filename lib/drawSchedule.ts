// Recurring draw-due-date helpers — kept pure/client-safe like lib/aging.ts.
//
// A project's cadence is either a fixed day-of-month or the last occurrence
// of a weekday in the month. "Overdue" means the cycle's due date has
// passed and no draw (any status) covers the current calendar month yet —
// the bar is just "does a draft/draw exist for this period," not that it's
// been submitted.
//
// A draw's date_submitted decides which cycle it belongs to — NOT when the
// record was created, and not the billing period it covers on its own.
// What a lender cares about is when the invoice actually went in, which
// can land in a different calendar month than the work period it bills
// for (e.g. a draw covering Aug 15-26 submitted Sep 21 satisfies
// September's cadence, not August's).
//
// But date_submitted is only trusted when it falls in the SAME due-date
// cycle as period_end — i.e. neither date crossed a due-date boundary
// between when the work period ended and when the invoice was actually
// filed. When they land in different cycles (a real case: a draw whose
// period ends right on this cycle's due date, but isn't filed until a few
// days into the next cycle), the late filing date doesn't get to
// retroactively claim the next cycle — that cycle still needs its own
// draw. Falls back to period_end's own cycle in that case, and further
// back to created_at for the rare row with neither date at all.

import { DrawDueType, Project, OwnerDraw } from "@/lib/types";

type ScheduleFields = Pick<Project, "draw_due_type" | "draw_due_day">;
type CycleFields = Pick<OwnerDraw, "period_end" | "date_submitted" | "created_at">;

/**
 * Server-side guard for draw_due_day — the Edit/Add Project forms already
 * constrain this via <select>/min/max, but that's a client-side courtesy
 * only. Without this, a bad value (e.g. a stray API call, or an out-of-range
 * weekday) doesn't error — it silently resolves to a nonsense date, since
 * the month-arithmetic below has no bounds checking of its own.
 */
export function isValidDrawDueDay(type: DrawDueType, day: number): boolean {
  if (!Number.isInteger(day)) return false;
  if (type === "day_of_month") return day >= 1 && day <= 31;
  return day >= 0 && day <= 6;
}

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

// A fixed day-of-month can land on a weekend, when nobody's submitting
// anything to the lender — pull it back to the preceding Friday. Doesn't
// apply to "last weekday" cadences, which are defined as a weekday already.
function rollBackToWeekday(d: Date): Date {
  const day = d.getDay();
  if (day === 6) return addDays(d, -1); // Saturday -> Friday
  if (day === 0) return addDays(d, -2); // Sunday -> Friday
  return d;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
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
    return rollBackToWeekday(new Date(year, month, day));
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

// Which cadence cycle a date belongs to: on or before that calendar
// month's own due date, it's that month's cycle; after it, the due date
// has already passed so it rolls into the next month's cycle instead. With
// no fixed cadence, cycles are just plain calendar months.
function cadenceBucket(project: ScheduleFields, date: Date): { year: number; month: number } {
  const dueThisMonth = getDrawDueDate(project, date);
  if (!dueThisMonth || startOfDay(date).getTime() <= startOfDay(dueThisMonth).getTime()) {
    return { year: date.getFullYear(), month: date.getMonth() };
  }
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function drawCycleDate(project: ScheduleFields, d: CycleFields): Date {
  const period = d.period_end ? parseDateOnly(d.period_end) : null;
  const submitted = d.date_submitted ? parseDateOnly(d.date_submitted) : null;

  if (submitted && period) {
    const periodBucket = cadenceBucket(project, period);
    const submittedBucket = cadenceBucket(project, submitted);
    if (periodBucket.year === submittedBucket.year && periodBucket.month === submittedBucket.month) {
      return submitted;
    }
    // Crossed a due-date boundary between the work period ending and the
    // invoice actually being filed — trust the period's own cycle, not a
    // late (or early) filing date that lands in a different one.
    return new Date(periodBucket.year, periodBucket.month, 1);
  }
  return submitted ?? period ?? parseDateOnly(d.created_at);
}

function hasDrawForCycle(
  project: ScheduleFields,
  projectDraws: CycleFields[],
  referenceDate: Date
): boolean {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  return projectDraws.some((d) => {
    const date = drawCycleDate(project, d);
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
  return !hasDrawForCycle(project, projectDraws, referenceDate);
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
  return !hasDrawForCycle(project, projectDraws, referenceDate);
}
