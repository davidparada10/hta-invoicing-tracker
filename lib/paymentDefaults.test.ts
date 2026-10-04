import { describe, expect, it } from "vitest";
import {
  checkExplicitPayment,
  defaultCashReceived,
  excludedLineIdSet,
  formPaymentIntent,
  ownerPaidFromAmounts,
  paidTransition,
} from "@/lib/paymentDefaults";

const lines = [
  { id: "hta-1", excluded_from_contract: false },
  { id: "hta-2", excluded_from_contract: false },
  { id: "owner-1", excluded_from_contract: true },
  { id: "owner-2", excluded_from_contract: true },
];

describe("ownerPaidFromAmounts", () => {
  it("sums only lines flagged excluded_from_contract", () => {
    expect(ownerPaidFromAmounts({ "hta-1": 80000, "owner-1": 12000, "owner-2": 8000 }, lines)).toBe(20000);
  });

  // The form's lineAmounts are strings and may be blank or half-typed.
  it("accepts the edit form's unsaved string amounts, ignoring blanks and junk", () => {
    expect(ownerPaidFromAmounts({ "owner-1": "15000.50", "owner-2": "", "hta-1": "999" }, lines)).toBe(15000.5);
    expect(ownerPaidFromAmounts({ "owner-1": "abc" }, lines)).toBe(0);
  });

  it("is 0 when nothing is owner-paid", () => {
    expect(ownerPaidFromAmounts({ "hta-1": 50000 }, lines)).toBe(0);
  });

  it("ignores amounts for lines it doesn't know about", () => {
    expect(ownerPaidFromAmounts({ ghost: 5000 }, lines)).toBe(0);
  });
});

describe("excludedLineIdSet", () => {
  it("returns just the owner-paid line ids", () => {
    expect([...excludedLineIdSet(lines)].sort()).toEqual(["owner-1", "owner-2"]);
  });
});

describe("defaultCashReceived", () => {
  // The brief's example.
  it("requested $100,000, owner-paid $20,000, nothing received → $80,000", () => {
    expect(defaultCashReceived({ requested: 100000, ownerPaid: 20000, alreadyReceived: 0 })).toBe(80000);
  });

  it("nets out an existing partial payment", () => {
    expect(defaultCashReceived({ requested: 100000, ownerPaid: 20000, alreadyReceived: 30000 })).toBe(50000);
  });

  it("never goes negative", () => {
    expect(defaultCashReceived({ requested: 100000, ownerPaid: 20000, alreadyReceived: 90000 })).toBe(0);
  });
});

describe("paidTransition", () => {
  it("nothing received yet: pre-fills the collectible amount and defaults a missing approval", () => {
    expect(paidTransition({ requested: 100000, approved: 0, alreadyReceived: 0, ownerPaid: 20000 })).toEqual({
      amountApproved: 100000,
      pendingPayment: { amount: 80000 },
    });
  });

  it("keeps a genuine partial approval", () => {
    const t = paidTransition({ requested: 100000, approved: 90000, alreadyReceived: 0, ownerPaid: 0 });
    expect(t.amountApproved).toBe(90000);
  });

  it("never re-defaults when money was already received (existing partial payments are preserved)", () => {
    expect(paidTransition({ requested: 100000, approved: 100000, alreadyReceived: 30000, ownerPaid: 20000 })).toEqual({
      amountApproved: 100000,
      pendingPayment: null,
    });
  });

  it("offers no payment when everything collectible is owner-paid", () => {
    expect(paidTransition({ requested: 20000, approved: 20000, alreadyReceived: 0, ownerPaid: 20000 }).pendingPayment).toBeNull();
  });
});

describe("checkExplicitPayment", () => {
  const base = { requested: 100000, ownerPaid: 20000, alreadyReceived: 0, confirmOverpayment: false };

  it("accepts an amount up to the remaining collectible balance", () => {
    expect(checkExplicitPayment({ ...base, amount: 80000 })).toEqual({ ok: true, overpaidBy: 0 });
    expect(checkExplicitPayment({ ...base, amount: 30000 })).toEqual({ ok: true, overpaidBy: 0 });
  });

  it("rejects zero and negative amounts", () => {
    expect(checkExplicitPayment({ ...base, amount: 0 }).ok).toBe(false);
    expect(checkExplicitPayment({ ...base, amount: -5 }).ok).toBe(false);
  });

  it("rejects an overpayment unless explicitly confirmed", () => {
    const r = checkExplicitPayment({ ...base, amount: 85000 });
    expect(r).toMatchObject({ ok: false, overpaidBy: 5000 });
  });

  it("allows a confirmed overpayment and reports how much", () => {
    expect(checkExplicitPayment({ ...base, amount: 85000, confirmOverpayment: true })).toEqual({
      ok: true,
      overpaidBy: 5000,
    });
  });

  it("measures the overpayment against what's still collectible after earlier receipts", () => {
    const r = checkExplicitPayment({ ...base, alreadyReceived: 60000, amount: 25000 });
    expect(r).toMatchObject({ ok: false, overpaidBy: 5000 });
  });

  it("a fully-paid draw treats any further payment as an overpayment", () => {
    const r = checkExplicitPayment({ ...base, alreadyReceived: 80000, amount: 100 });
    expect(r).toMatchObject({ ok: false, overpaidBy: 100 });
  });
});

describe("formPaymentIntent", () => {
  const base = { requested: 100000, ownerPaid: 20000, alreadyReceived: 0 };

  it("sends nothing when no payment is being recorded", () => {
    expect(formPaymentIntent({ ...base, active: false, override: null })).toEqual({
      mode: "none",
      amount: 0,
      overpaidBy: 0,
    });
  });

  it("untouched amount is the collectible default (the brief's $80,000)", () => {
    expect(formPaymentIntent({ ...base, active: true, override: null })).toEqual({
      mode: "default",
      amount: 80000,
      overpaidBy: 0,
    });
  });

  // The form preview must follow edits that haven't been saved yet.
  it("the default tracks an unsaved owner-paid allocation change", () => {
    const before = formPaymentIntent({ ...base, ownerPaid: 20000, active: true, override: null });
    const after = formPaymentIntent({ ...base, ownerPaid: 35000, active: true, override: null });
    expect(before.amount).toBe(80000);
    expect(after.amount).toBe(65000);
  });

  it("a typed amount is explicit and preserved even if allocations change afterward", () => {
    const a = formPaymentIntent({ ...base, ownerPaid: 20000, active: true, override: "30000" });
    const b = formPaymentIntent({ ...base, ownerPaid: 35000, active: true, override: "30000" });
    expect(a).toMatchObject({ mode: "explicit", amount: 30000, overpaidBy: 0 });
    expect(b.amount).toBe(30000);
  });

  it("flags how far an explicit amount exceeds what's still collectible", () => {
    expect(formPaymentIntent({ ...base, active: true, override: "85000" })).toMatchObject({
      mode: "explicit",
      overpaidBy: 5000,
    });
  });

  it("an existing partial payment is subtracted from the default and from the overpayment line", () => {
    expect(formPaymentIntent({ ...base, alreadyReceived: 30000, active: true, override: null }).amount).toBe(50000);
    expect(formPaymentIntent({ ...base, alreadyReceived: 30000, active: true, override: "55000" }).overpaidBy).toBe(5000);
  });
});
