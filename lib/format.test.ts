import { describe, expect, it } from "vitest";
import {
  businessToday,
  businessTodayISO,
  formatCurrency,
  formatCurrencyRounded,
  formatDate,
  parseLocalDate,
} from "@/lib/format";

describe("parseLocalDate", () => {
  // Regression test: this exact bug (plain `new Date("YYYY-MM-DD")` parses
  // as UTC midnight, shifting to the previous day/month in any timezone
  // behind UTC) shipped twice this session — once in lib/drawSchedule.ts,
  // once in lib/aging.ts and lib/billing.ts.
  it("parses a bare date as local midnight, not UTC midnight", () => {
    const d = parseLocalDate("2026-09-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September, 0-indexed
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it("does not roll back to the previous month at a month boundary", () => {
    // new Date("2026-09-01") in any timezone behind UTC gives August 31.
    const d = parseLocalDate("2026-09-01");
    expect(d.getMonth()).toBe(8);
  });

  it("passes a full timestamp through unchanged", () => {
    const iso = "2026-08-26T20:56:57.320218+00:00";
    const d = parseLocalDate(iso);
    expect(d.toISOString()).toBe(new Date(iso).toISOString());
  });
});

describe("formatDate", () => {
  it("renders a bare date on the correct calendar day", () => {
    expect(formatDate("2026-09-01")).toBe("Sep 1, 2026");
  });

  it("renders an em dash for a null/undefined date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats a number as USD currency", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("treats null/undefined as zero", () => {
    expect(formatCurrency(null)).toBe("$0.00");
    expect(formatCurrency(undefined)).toBe("$0.00");
  });
});

describe("formatCurrencyRounded", () => {
  it("rounds to whole dollars", () => {
    expect(formatCurrencyRounded(43538.4)).toBe("$43,538");
  });

  it("preserves a negative sign", () => {
    expect(formatCurrencyRounded(-1200)).toBe("-$1,200");
  });

  it("treats null/undefined as zero", () => {
    expect(formatCurrencyRounded(null)).toBe("$0");
    expect(formatCurrencyRounded(undefined)).toBe("$0");
  });
});

describe("businessTodayISO / businessToday", () => {
  // Regression test for a real production incident: a draw marked
  // submitted at ~6pm Pacific on Sep 30 was stamped date_submitted =
  // "2026-10-01" because the server (UTC) had already rolled to October,
  // several hours before it actually was October in HTA's own timezone.
  it("reads the Pacific calendar date, not the UTC one, for an evening Pacific instant", () => {
    // 2026-10-01T01:00:00Z = 2026-09-30 18:00 PDT (UTC-7) — already
    // "tomorrow" in UTC, still "today" on the US west coast.
    const eveningPacific = new Date("2026-10-01T01:00:00Z");
    expect(businessTodayISO(eveningPacific)).toBe("2026-09-30");
  });

  it("agrees with the UTC date once it's actually morning in the US", () => {
    const morningPacific = new Date("2026-09-30T15:00:00Z"); // 8am PDT
    expect(businessTodayISO(morningPacific)).toBe("2026-09-30");
  });

  it("businessToday returns a local-midnight Date for the same calendar day", () => {
    const eveningPacific = new Date("2026-10-01T01:00:00Z");
    const d = businessToday(eveningPacific);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September
    expect(d.getDate()).toBe(30);
  });
});
