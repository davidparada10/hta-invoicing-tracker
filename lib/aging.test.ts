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
