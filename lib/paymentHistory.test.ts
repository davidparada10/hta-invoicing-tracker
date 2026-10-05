import { describe, expect, it } from "vitest";
import {
  DrawPayment,
  lastPaymentDate,
  paymentsByPeriod,
  paymentsForDraws,
  syntheticLegacyPayment,
  totalPaid,
} from "@/lib/paymentHistory";

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

// Stand-in for lib/format's businessTodayISO applied to a timestamp.
const businessDate = (iso: string) => iso.slice(0, 10);

describe("totalPaid", () => {
  it("sums live receipts, ignoring voided ones", () => {
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
  it("returns the most recent live receipt's date", () => {
    const payments = [
      payment({ id: "p1", date_received: "2026-09-20" }),
      payment({ id: "p2", date_received: "2026-10-05" }),
    ];
    expect(lastPaymentDate(payments)).toBe("2026-10-05");
  });

  it("ignores voided receipts", () => {
    const payments = [
      payment({ id: "p1", date_received: "2026-09-20" }),
      payment({ id: "p2", date_received: "2026-10-05", deleted_at: "2026-10-06T00:00:00Z" }),
    ];
    expect(lastPaymentDate(payments)).toBe("2026-09-20");
  });

  it("returns null when there are no receipts", () => {
    expect(lastPaymentDate([])).toBeNull();
  });
});

describe("paymentsByPeriod", () => {
  // The bug fix: the $50k from the report doesn't all land in October.
  it("buckets each receipt by its own date: $30k in September, $20k in October", () => {
    const payments = [
      payment({ id: "p1", amount: 30000, date_received: "2026-09-20" }),
      payment({ id: "p2", amount: 20000, date_received: "2026-10-05" }),
    ];
    const byMonth = paymentsByPeriod(payments, (d) => d.slice(0, 7));
    expect(byMonth.get("2026-09")).toBe(30000);
    expect(byMonth.get("2026-10")).toBe(20000);
    expect(totalPaid(payments)).toBe(50000);
  });

  it("sums receipts landing in the same period and skips voided ones", () => {
    const payments = [
      payment({ id: "p1", amount: 1000, date_received: "2026-09-05" }),
      payment({ id: "p2", amount: 2000, date_received: "2026-09-25" }),
      payment({ id: "p3", amount: 500, date_received: "2026-09-26", deleted_at: "2026-09-27T00:00:00Z" }),
    ];
    expect(paymentsByPeriod(payments, (d) => d.slice(0, 7)).get("2026-09")).toBe(3000);
  });
});

describe("syntheticLegacyPayment", () => {
  const draw = {
    id: "d1",
    amount_paid: 50000,
    date_paid: "2026-10-05" as string | null,
    date_submitted: "2026-09-01" as string | null,
    created_at: "2026-08-15T12:00:00Z",
  };

  it("builds one receipt with the draw's known total and date — no invented installments", () => {
    expect(syntheticLegacyPayment(draw, businessDate)).toMatchObject({
      draw_id: "d1",
      amount: 50000,
      date_received: "2026-10-05",
      source: "legacy",
      date_inferred: false,
    });
  });

  it("keeps money that has no date_paid, falling back submitted → created like paidDate() does, and flags it", () => {
    expect(syntheticLegacyPayment({ ...draw, date_paid: null }, businessDate)).toMatchObject({
      date_received: "2026-09-01",
      date_inferred: true,
    });
    expect(
      syntheticLegacyPayment({ ...draw, date_paid: null, date_submitted: null }, businessDate)?.date_received
    ).toBe("2026-08-15");
  });

  it("returns null for a draw with nothing received", () => {
    expect(syntheticLegacyPayment({ ...draw, amount_paid: 0 }, businessDate)).toBeNull();
  });
});

describe("paymentsForDraws", () => {
  const base = { date_submitted: null, created_at: "2026-08-15T12:00:00Z" };
  const migrated = { ...base, id: "migrated", amount_paid: 50000, date_paid: "2026-10-05" };
  const legacy = { ...base, id: "legacy", amount_paid: 7000, date_paid: "2026-06-01" };
  const unpaid = { ...base, id: "unpaid", amount_paid: 0, date_paid: null };

  it("uses real receipts where a draw has them and synthesizes one for a draw that has none", () => {
    const rows = [
      payment({ id: "a", draw_id: "migrated", amount: 30000, date_received: "2026-09-20" }),
      payment({ id: "b", draw_id: "migrated", amount: 20000, date_received: "2026-10-05" }),
    ];
    const out = paymentsForDraws([migrated, legacy, unpaid], rows, businessDate);
    expect(out.filter((p) => p.draw_id === "migrated").map((p) => p.amount).sort((a, b) => a - b)).toEqual([20000, 30000]);
    expect(out.filter((p) => p.draw_id === "legacy")).toEqual([
      expect.objectContaining({ source: "legacy", amount: 7000, date_received: "2026-06-01" }),
    ]);
    expect(out.some((p) => p.draw_id === "unpaid")).toBe(false);
  });

  it("works with no receipt rows at all — every report keeps working before the migration", () => {
    const out = paymentsForDraws([migrated, legacy], [], businessDate);
    expect(out.map((p) => p.amount).sort((a, b) => a - b)).toEqual([7000, 50000]);
  });

  it("drops receipts whose draw isn't in the live list (e.g. trashed)", () => {
    const rows = [payment({ id: "x", draw_id: "trashed-draw", amount: 999 })];
    expect(paymentsForDraws([legacy], rows, businessDate).some((p) => p.draw_id === "trashed-draw")).toBe(false);
  });
});
