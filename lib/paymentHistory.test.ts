import { describe, expect, it } from "vitest";
import {
  daysToLastPayment,
  DrawPayment,
  lastPaymentDate,
  paymentsByPeriod,
  recordPayment,
  syntheticLegacyPayment,
  totalPaid,
} from "@/lib/paymentHistory";

let nextId = 0;
const makeId = () => `payment-${++nextId}`;
const fixedNow = () => "2026-10-01T00:00:00Z";

function payment(overrides: Partial<DrawPayment> = {}): DrawPayment {
  return {
    id: "p1",
    draw_id: "draw-1",
    amount: 1000,
    date_received: "2026-09-01",
    source: "manual",
    idempotency_key: null,
    created_at: "2026-09-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("recordPayment", () => {
  it("appends a new payment", () => {
    const { payments, payment: added, wasDuplicate } = recordPayment(
      [],
      { draw_id: "draw-1", amount: 30000, date_received: "2026-09-15", source: "manual" },
      makeId,
      fixedNow
    );
    expect(wasDuplicate).toBe(false);
    expect(payments).toHaveLength(1);
    expect(added).toEqual({
      id: "payment-1",
      draw_id: "draw-1",
      amount: 30000,
      date_received: "2026-09-15",
      source: "manual",
      idempotency_key: null,
      created_at: "2026-10-01T00:00:00Z",
      deleted_at: null,
    });
  });

  // The guard markDrawPaidTool lacks today — two identical agent calls
  // (same idempotency_key) must not both apply.
  it("returns the existing payment instead of duplicating when idempotency_key matches a live payment", () => {
    const first = recordPayment(
      [],
      { draw_id: "draw-1", amount: 20000, date_received: "2026-10-01", source: "ai", idempotency_key: "req-1" },
      makeId,
      fixedNow
    );
    const second = recordPayment(
      first.payments,
      { draw_id: "draw-1", amount: 20000, date_received: "2026-10-01", source: "ai", idempotency_key: "req-1" },
      makeId,
      fixedNow
    );
    expect(second.wasDuplicate).toBe(true);
    expect(second.payments).toHaveLength(1);
    expect(second.payment).toEqual(first.payment);
  });

  it("allows the same idempotency_key again once the original was soft-deleted (a corrected retry)", () => {
    const first = recordPayment(
      [],
      { draw_id: "draw-1", amount: 20000, date_received: "2026-10-01", source: "ai", idempotency_key: "req-1" },
      makeId,
      fixedNow
    );
    const deleted = first.payments.map((p) => ({ ...p, deleted_at: "2026-10-01T01:00:00Z" }));
    const retry = recordPayment(
      deleted,
      { draw_id: "draw-1", amount: 20000, date_received: "2026-10-01", source: "ai", idempotency_key: "req-1" },
      makeId,
      fixedNow
    );
    expect(retry.wasDuplicate).toBe(false);
    expect(retry.payments).toHaveLength(2);
  });

  it("never dedupes when no idempotency_key is given (ordinary manual entry)", () => {
    const first = recordPayment([], { draw_id: "draw-1", amount: 500, date_received: "2026-09-01", source: "manual" }, makeId, fixedNow);
    const second = recordPayment(first.payments, { draw_id: "draw-1", amount: 500, date_received: "2026-09-01", source: "manual" }, makeId, fixedNow);
    expect(second.wasDuplicate).toBe(false);
    expect(second.payments).toHaveLength(2);
  });
});

describe("totalPaid", () => {
  it("sums live payments, ignoring soft-deleted ones", () => {
    const payments = [
      payment({ amount: 30000 }),
      payment({ amount: 20000, id: "p2" }),
      payment({ amount: 9999, id: "p3", deleted_at: "2026-09-02T00:00:00Z" }),
    ];
    expect(totalPaid(payments)).toBe(50000);
  });

  it("is 0 for no payments", () => {
    expect(totalPaid([])).toBe(0);
  });
});

describe("lastPaymentDate", () => {
  // The exact scenario from the bug report: $30k in September, $20k in
  // October — the derived "last payment date" is the October payment's
  // date, same as today's date_paid would end up being, but now each
  // payment still carries its own correct date for period bucketing.
  it("returns the most recent payment's date", () => {
    const payments = [
      payment({ id: "p1", amount: 30000, date_received: "2026-09-20" }),
      payment({ id: "p2", amount: 20000, date_received: "2026-10-05" }),
    ];
    expect(lastPaymentDate(payments)).toBe("2026-10-05");
  });

  it("ignores soft-deleted payments", () => {
    const payments = [
      payment({ id: "p1", date_received: "2026-09-20" }),
      payment({ id: "p2", date_received: "2026-10-05", deleted_at: "2026-10-06T00:00:00Z" }),
    ];
    expect(lastPaymentDate(payments)).toBe("2026-09-20");
  });

  it("returns null when there are no payments", () => {
    expect(lastPaymentDate([])).toBeNull();
  });
});

describe("paymentsByPeriod", () => {
  // This is the actual bug fix: the $50k from the report doesn't all land
  // in October — $30k buckets to September, $20k to October.
  it("buckets each payment into its own period by its own date, not one shared date", () => {
    const payments = [
      payment({ id: "p1", amount: 30000, date_received: "2026-09-20" }),
      payment({ id: "p2", amount: 20000, date_received: "2026-10-05" }),
    ];
    const byMonth = paymentsByPeriod(payments, (d) => d.slice(0, 7));
    expect(byMonth.get("2026-09")).toBe(30000);
    expect(byMonth.get("2026-10")).toBe(20000);
  });

  it("sums multiple payments landing in the same period", () => {
    const payments = [
      payment({ id: "p1", amount: 1000, date_received: "2026-09-05" }),
      payment({ id: "p2", amount: 2000, date_received: "2026-09-25" }),
    ];
    const byMonth = paymentsByPeriod(payments, (d) => d.slice(0, 7));
    expect(byMonth.get("2026-09")).toBe(3000);
  });
});

describe("daysToLastPayment", () => {
  function fakeCalendarDaysBetween(aISO: string, b: Date): number {
    const a = new Date(aISO + (aISO.length <= 10 ? "T00:00:00Z" : ""));
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }
  function fakeParseLocalDate(value: string): Date {
    return new Date(value + "T00:00:00Z");
  }

  it("is days from submission to the LAST (final-settlement) payment, not the first", () => {
    const payments = [
      payment({ id: "p1", date_received: "2026-09-05" }),
      payment({ id: "p2", date_received: "2026-09-15" }),
    ];
    const days = daysToLastPayment(payments, "2026-09-01", fakeCalendarDaysBetween, fakeParseLocalDate);
    expect(days).toBe(14); // to Sep 15, not Sep 5
  });

  it("returns null when nothing has been paid yet", () => {
    expect(daysToLastPayment([], "2026-09-01", fakeCalendarDaysBetween, fakeParseLocalDate)).toBeNull();
  });
});

describe("syntheticLegacyPayment", () => {
  it("builds one payment matching the draw's existing total and date — no invented installments", () => {
    const p = syntheticLegacyPayment("draw-1", 50000, "2026-10-05", makeId);
    expect(p).toEqual({
      id: expect.any(String),
      draw_id: "draw-1",
      amount: 50000,
      date_received: "2026-10-05",
      source: "manual",
      idempotency_key: null,
      created_at: expect.any(String),
      deleted_at: null,
    });
  });

  it("returns null for a draw with nothing paid", () => {
    expect(syntheticLegacyPayment("draw-1", 0, null, makeId)).toBeNull();
  });

  it("returns null when amount_paid is set but date_paid is missing (can't backfill a dateless payment)", () => {
    expect(syntheticLegacyPayment("draw-1", 5000, null, makeId)).toBeNull();
  });
});
