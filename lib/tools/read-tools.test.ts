import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { getRecentPaymentsTool } = await import("@/lib/tools/read-tools");

const ctx = { toolCallId: "t", messages: [], context: undefined as never };

function draw(overrides: Row) {
  return {
    project_id: "proj-A",
    draw_number: 1,
    amount_requested: 50000,
    amount_approved: 50000,
    retainage_held: 0,
    amount_paid: 0,
    date_paid: null,
    date_submitted: "2026-08-25",
    date_approved: null,
    status: "paid",
    created_at: "2026-08-25T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function receipt(id: string, drawId: string, amount: number, date: string) {
  return {
    id,
    draw_id: drawId,
    amount,
    date_received: date,
    source: "manual",
    idempotency_key: null,
    created_at: `${date}T00:00:00Z`,
    deleted_at: null,
  };
}

beforeEach(() => {
  tables = {
    inv_projects: [{ id: "proj-A", name: "Project A" }],
    inv_owner_draws: [
      draw({ id: "split", draw_number: 1, amount_paid: 50000, date_paid: "2026-10-05" }),
      draw({ id: "legacy", draw_number: 2, amount_paid: 7000, date_paid: "2026-06-01" }),
      draw({ id: "trashed", draw_number: 3, amount_paid: 999, date_paid: "2026-09-20", deleted_at: "2026-10-01T00:00:00Z" }),
    ],
    inv_draw_payments: [
      receipt("a", "split", 30000, "2026-09-20"),
      receipt("b", "split", 20000, "2026-10-05"),
      receipt("t", "trashed", 999, "2026-09-20"),
    ],
  };
});

const run = (date: string) =>
  getRecentPaymentsTool.execute!({ date }, ctx) as unknown as Promise<{
    date: string;
    payments: { drawNumber: number; amountReceived: number; drawTotalReceived: number }[];
  }>;

describe("getRecentPaymentsTool — by each payment's own date", () => {
  // The old tool matched one date_paid per draw, so the September payment became
  // unfindable once the draw's date was overwritten to October.
  it("finds the September payment on September 20 with just that day's amount", async () => {
    const { payments } = await run("2026-09-20");
    expect(payments).toEqual([expect.objectContaining({ drawNumber: 1, amountReceived: 30000, drawTotalReceived: 50000 })]);
  });

  it("finds the October payment on October 5 with just that day's amount", async () => {
    const { payments } = await run("2026-10-05");
    expect(payments).toEqual([expect.objectContaining({ drawNumber: 1, amountReceived: 20000 })]);
  });

  it("still reports a draw with no receipt rows from its cached total and date", async () => {
    const { payments } = await run("2026-06-01");
    expect(payments).toEqual([expect.objectContaining({ drawNumber: 2, amountReceived: 7000 })]);
  });

  it("never reports a trashed draw's payment", async () => {
    const { payments } = await run("2026-09-20");
    expect(payments.some((p) => p.drawNumber === 3)).toBe(false);
  });

  it("reports nothing for a date with no payments", async () => {
    expect((await run("2026-01-01")).payments).toEqual([]);
  });
});
