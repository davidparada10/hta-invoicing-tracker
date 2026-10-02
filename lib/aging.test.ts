import { describe, expect, it } from "vitest";
import { agingBucket, daysOpen } from "@/lib/aging";

describe("daysOpen", () => {
  it("computes whole days between two local-midnight dates", () => {
    const now = new Date(2026, 8, 8); // Sep 8, 2026, local midnight
    expect(daysOpen("2026-09-01", now)).toBe(7);
  });

  // Regression test: daysOpen used to parse the reference date with plain
  // `new Date(...)`, which treats a bare "YYYY-MM-DD" as UTC midnight and
  // shifts the count by a day in any timezone behind UTC.
  it("doesn't lose a day to UTC-midnight parsing at a month boundary", () => {
    const now = new Date(2026, 8, 1); // Sep 1, local midnight
    expect(daysOpen("2026-08-31", now)).toBe(1);
  });

  it("never returns a negative age", () => {
    const now = new Date(2026, 8, 1);
    expect(daysOpen("2026-09-05", now)).toBe(0);
  });

  // Regression: daysOpen used to divide raw elapsed milliseconds by 24h,
  // which undercounts a span that crosses a DST transition in the
  // runtime's own local timezone (new Date(y,m,d) is constructed in that
  // timezone) — a real risk for local dev running in America/Los_Angeles,
  // even though it never showed up on Vercel's UTC-only production server.
  it("counts two full days across the spring-forward transition (Mar 7-9, 2026)", () => {
    const now = new Date(2026, 2, 9); // Mon Mar 9 — DST started Sun Mar 8
    expect(daysOpen("2026-03-07", now)).toBe(2);
  });

  it("counts one full day across the fall-back transition (Nov 1-2, 2026)", () => {
    const now = new Date(2026, 10, 2); // Mon Nov 2 — DST ended Sun Nov 1
    expect(daysOpen("2026-11-01", now)).toBe(1);
  });

  it("returns 0 for the same day", () => {
    const now = new Date(2026, 8, 8);
    expect(daysOpen("2026-09-08", now)).toBe(0);
  });

  it("counts correctly across a year boundary", () => {
    const now = new Date(2026, 0, 2); // Jan 2, 2026
    expect(daysOpen("2025-12-30", now)).toBe(3);
  });

  // referenceDateISO can be a full timestamp (callers fall back to
  // created_at when date_submitted is null) — resolved through the same
  // business-timezone conversion "now" gets, not read as raw UTC/local.
  it("resolves a full timestamp reference through business-timezone, not raw UTC", () => {
    const now = new Date(2026, 9, 1); // Oct 1, 2026, local midnight
    // 11pm Pacific on Sep 30 is still Sep 30 in HTA's business timezone,
    // even though it's already Oct 1 in UTC.
    expect(daysOpen("2026-10-01T06:00:00Z", now)).toBe(1);
  });
});

describe("agingBucket", () => {
  it("buckets days into the correct range", () => {
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(30)).toBe("current");
    expect(agingBucket(31)).toBe("31-60");
    expect(agingBucket(60)).toBe("31-60");
    expect(agingBucket(61)).toBe("61-90");
    expect(agingBucket(90)).toBe("61-90");
    expect(agingBucket(91)).toBe("90+");
  });
});
