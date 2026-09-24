import { describe, expect, it } from "vitest";
import {
  daysUntilDrawDue,
  drawDueLabel,
  getDrawDueDate,
  isDrawOverdue,
  isDrawUrgent,
  isValidDrawDueDay,
} from "@/lib/drawSchedule";

describe("getDrawDueDate", () => {
  it("returns null with no cadence configured", () => {
    expect(getDrawDueDate({ draw_due_type: null, draw_due_day: null })).toBeNull();
  });

  it("resolves a day-of-month cadence to this cycle's calendar date", () => {
    const due = getDrawDueDate(
      { draw_due_type: "day_of_month", draw_due_day: 25 },
      new Date(2026, 8, 3) // Sep 3, 2026
    );
    expect(due?.getMonth()).toBe(8);
    expect(due?.getDate()).toBe(25);
  });

  it("clamps a day-of-month past the month's last day", () => {
    const due = getDrawDueDate(
      { draw_due_type: "day_of_month", draw_due_day: 31 },
      new Date(2026, 3, 1) // April, only 30 days
    );
    expect(due?.getDate()).toBe(30);
  });

  it("rolls a weekend due date back to the preceding Friday", () => {
    // Sep 25, 2026 is a Friday; the 27th (Sunday) should roll back to it.
    const due = getDrawDueDate(
      { draw_due_type: "day_of_month", draw_due_day: 27 },
      new Date(2026, 8, 1)
    );
    expect(due?.getDay()).not.toBe(0);
    expect(due?.getDay()).not.toBe(6);
  });

  it("resolves a last-weekday cadence to the final matching weekday", () => {
    const due = getDrawDueDate(
      { draw_due_type: "last_weekday", draw_due_day: 4 }, // last Thursday
      new Date(2026, 8, 1)
    );
    expect(due?.getDay()).toBe(4);
    // The next day (if in-month) must not also be a Thursday, i.e. this is
    // the *last* one in the month.
    const nextWeek = new Date(due!);
    nextWeek.setDate(nextWeek.getDate() + 7);
    expect(nextWeek.getMonth()).not.toBe(due!.getMonth());
  });
});

describe("drawDueLabel", () => {
  it("renders a short human date", () => {
    const label = drawDueLabel(
      { draw_due_type: "day_of_month", draw_due_day: 15 },
      new Date(2026, 8, 1)
    );
    expect(label).toBe("Due Sep 15");
  });

  it("returns null with no cadence", () => {
    expect(drawDueLabel({ draw_due_type: null, draw_due_day: null })).toBeNull();
  });
});

describe("isValidDrawDueDay", () => {
  it("accepts 1-31 for day_of_month", () => {
    expect(isValidDrawDueDay("day_of_month", 1)).toBe(true);
    expect(isValidDrawDueDay("day_of_month", 31)).toBe(true);
    expect(isValidDrawDueDay("day_of_month", 0)).toBe(false);
    expect(isValidDrawDueDay("day_of_month", 32)).toBe(false);
  });

  it("accepts 0-6 for last_weekday", () => {
    expect(isValidDrawDueDay("last_weekday", 0)).toBe(true);
    expect(isValidDrawDueDay("last_weekday", 6)).toBe(true);
    expect(isValidDrawDueDay("last_weekday", 7)).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isValidDrawDueDay("day_of_month", 15.5)).toBe(false);
  });
});

describe("isDrawOverdue / isDrawUrgent — cycle matching by period_end", () => {
  const project = { draw_due_type: "day_of_month" as const, draw_due_day: 7 };
  const referenceDate = new Date(2026, 8, 8); // Sep 8, one day past due

  // Regression coverage for the exact confusion this session: a draw's
  // period_end (not date_submitted or created_at) decides which calendar
  // month it satisfies.

  it("is overdue when no draw's period_end falls in the current month", () => {
    const draws = [{ period_end: "2026-08-25", date_submitted: null, created_at: "2026-08-26T00:00:00Z" }];
    expect(isDrawOverdue(project, draws, referenceDate)).toBe(true);
  });

  it("is not overdue once a draw's period_end falls in the current month", () => {
    const draws = [{ period_end: "2026-09-05", date_submitted: null, created_at: "2026-08-26T00:00:00Z" }];
    expect(isDrawOverdue(project, draws, referenceDate)).toBe(false);
  });

  it("trusts date_submitted when it lands in the same due-date cycle as period_end", () => {
    // Due the 7th: period_end Aug 25 is already past August's own due date,
    // so it rolls into September's cycle — and Sep 3 (before September's
    // due date) also lands in September's cycle. Same cycle both ways, so
    // the actual submission date decides, and it satisfies September.
    const draws = [
      { period_end: "2026-08-25", date_submitted: "2026-09-03", created_at: "2026-08-26T22:14:29Z" },
    ];
    expect(isDrawOverdue(project, draws, referenceDate)).toBe(false);
  });

  it("falls back to period_end's own cycle when date_submitted crosses into a different one", () => {
    // The actual Victoria draw #7 case, due the 25th: period_end Aug 25 is
    // exactly on August's own due date (August's cycle), but it wasn't
    // filed until Sep 3 — after August's due date but before September's,
    // so date_submitted's own cycle is September. Different cycles, so the
    // late filing doesn't get to retroactively satisfy September; that
    // cycle still needs its own draw.
    const victoria = { draw_due_type: "day_of_month" as const, draw_due_day: 25 };
    const afterSeptDue = new Date(2026, 8, 26); // Sep 26, one day past due
    const draws = [
      { period_end: "2026-08-25", date_submitted: "2026-09-03", created_at: "2026-08-26T22:14:29Z" },
    ];
    expect(isDrawOverdue(victoria, draws, afterSeptDue)).toBe(true);
  });

  it("falls back to period_end's cycle the other direction too: a draw filed well past its own period's due date", () => {
    // The actual Gilmore draw #9 case, due the 15th: period_end Aug 26 is
    // already past August's due date, so it's in September's cycle. It
    // wasn't filed until Sep 21 — past September's own due date too, so
    // date_submitted's cycle is October. Different cycles again, so it
    // falls back to period_end's cycle (September) rather than the later
    // October filing date, and correctly satisfies September.
    const gilmore = { draw_due_type: "day_of_month" as const, draw_due_day: 15 };
    const lateSept = new Date(2026, 8, 24); // Sep 24
    const draws = [
      { period_end: "2026-08-26", date_submitted: "2026-09-21", created_at: "2026-08-26T22:14:29Z" },
    ];
    expect(isDrawOverdue(gilmore, draws, lateSept)).toBe(false);
  });

  it("isDrawUrgent fires within the warning window even before the due date", () => {
    const nearDue = new Date(2026, 8, 3); // 4 days before the 7th — within the window
    const notYetDue = new Date(2026, 8, 1); // 6 days before the 7th — outside it
    expect(isDrawUrgent(project, [], nearDue, 5)).toBe(true);
    expect(isDrawUrgent(project, [], notYetDue, 5)).toBe(false);
  });

  it("neither fires once a covering draw exists", () => {
    const draws = [{ period_end: "2026-09-01", date_submitted: null, created_at: "2026-09-01T00:00:00Z" }];
    expect(isDrawOverdue(project, draws, referenceDate)).toBe(false);
    expect(isDrawUrgent(project, draws, referenceDate)).toBe(false);
  });

  it("returns false/null with no cadence configured", () => {
    const noCadence = { draw_due_type: null, draw_due_day: null };
    expect(isDrawOverdue(noCadence, [], referenceDate)).toBe(false);
    expect(isDrawUrgent(noCadence, [], referenceDate)).toBe(false);
    expect(daysUntilDrawDue(noCadence, referenceDate)).toBeNull();
  });
});
