/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are loosely typed JSON in these assertions */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const {
  getBillingSummaryTool,
  getMonthlyBillingTool,
  getRecentPaymentsTool,
  getLenderSummaryTool,
  getOpenDrawsTool,
  getAgingSummaryTool,
  getOutstandingSummaryTool,
  listProjectsTool,
} = await import("@/lib/tools/read-tools");

const ctx = { toolCallId: "t", messages: [], context: undefined as never };

const project = (id: string, name: string, developer: string | null, lender: string | null, status = "active"): Row => ({
  id, name, project_number: id, address: null, lender, developer, status,
  created_at: "2026-01-01T00:00:00Z", draw_due_type: null, draw_due_day: null, draw_skip_month: null,
});

const draw = (id: string, projectId: string, n: number, o: Row): Row => ({
  id, project_id: projectId, draw_number: n, amount_requested: 0, amount_approved: 0, retainage_held: 0,
  amount_paid: 0, date_paid: null, date_submitted: "2026-09-01", date_approved: null, status: "paid",
  notes: null, created_at: "2026-09-01T00:00:00Z", deleted_at: null, ...o,
});

const receipt = (id: string, drawId: string, amount: number, date: string): Row => ({
  id, draw_id: drawId, amount, date_received: date, source: "manual", idempotency_key: null,
  date_inferred: false, created_at: `${date}T00:00:00Z`, deleted_at: null,
});

// Synthetic. HVN has two projects with different lenders; SeaChange has one.
//   H1 (HVN, Bank One): Sep draw $100k paid $60k Sep 10 + $40k Oct 5; Oct draw $50k unpaid; a Nov draft
//   H2 (HVN, Bank Two, closed): Sep draw $20k paid Sep 20
//   S1 (SeaChange, Bank One): Sep draw $30k paid Oct 3; an Oct draw $70k unpaid
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  tables = {
    inv_projects: [
      project("H1", "Hvn One", "HVN", "Bank One"),
      project("H2", "Hvn Two Closed", "HVN", "Bank Two", "closed"),
      project("S1", "Sea One", "SeaChange", "Bank One"),
    ],
    inv_owner_draws: [
      draw("h1a", "H1", 1, { amount_requested: 100000, amount_approved: 100000, amount_paid: 100000, date_paid: "2026-10-05", date_submitted: "2026-09-02" }),
      draw("h1b", "H1", 2, { amount_requested: 50000, amount_approved: 50000, status: "approved", date_submitted: "2026-10-02" }),
      draw("h1c", "H1", 3, { amount_requested: 80000, status: "draft", date_submitted: null, created_at: "2026-10-15T00:00:00Z" }),
      draw("h2a", "H2", 1, { amount_requested: 20000, amount_approved: 20000, amount_paid: 20000, date_paid: "2026-09-20", date_submitted: "2026-09-05" }),
      draw("s1a", "S1", 1, { amount_requested: 30000, amount_approved: 30000, amount_paid: 30000, date_paid: "2026-10-03", date_submitted: "2026-09-08" }),
      draw("s1b", "S1", 2, { amount_requested: 70000, status: "submitted", date_submitted: "2026-10-10" }),
    ],
    inv_project_budget_lines: [],
    inv_draw_line_allocations: [],
    inv_draw_payments: [
      receipt("r1", "h1a", 60000, "2026-09-10"),
      receipt("r2", "h1a", 40000, "2026-10-05"),
      receipt("r3", "h2a", 20000, "2026-09-20"),
      receipt("r4", "s1a", 30000, "2026-10-03"),
    ],
  };
});
afterEach(() => vi.useRealTimers());

describe("billing summary by developer and lender", () => {
  it("returns byDeveloper and byLender with requested, received and days", async () => {
    const r = (await getBillingSummaryTool.execute!({ year: 2026 }, ctx)) as any;
    const dev = (n: string) => r.byDeveloper.find((g: any) => g.name === n);
    expect(dev("HVN")).toMatchObject({ requested: 100000 + 50000 + 20000, received: 100000 + 20000 });
    expect(dev("SeaChange")).toMatchObject({ requested: 100000, received: 30000 });
    const lend = (n: string) => r.byLender.find((g: any) => g.name === n);
    expect(lend("Bank One")).toMatchObject({ requested: 100000 + 50000 + 30000 + 70000, received: 130000 });
    expect(lend("Bank Two")).toMatchObject({ requested: 20000, received: 20000 });
    expect(typeof dev("HVN").avgDaysToPay === "number" || dev("HVN").avgDaysToPay === null).toBe(true);
  });
});

describe("monthly billing tool", () => {
  it("invoiced by submitted month (no drafts), received by each payment's own month", async () => {
    const r = (await getMonthlyBillingTool.execute!({ year: 2026 }, ctx)) as any;
    const m = (k: string) => r.months.find((x: any) => x.month === k);
    expect(m("2026-09")).toMatchObject({ invoiced: 100000 + 20000 + 30000, received: 60000 + 20000 });
    expect(m("2026-10")).toMatchObject({ invoiced: 50000 + 70000, received: 40000 + 30000 });
    expect(r.totalInvoiced).toBe(270000);
    expect(r.totalReceived).toBe(150000);
    expect(r.scope).toMatch(/all projects/i);
  });

  it("narrows by developer, lender and project; unknown names are errors", async () => {
    const hvn = (await getMonthlyBillingTool.execute!({ year: 2026, developer: "hvn" }, ctx)) as any;
    expect(hvn.totalInvoiced).toBe(170000);
    const bank2 = (await getMonthlyBillingTool.execute!({ year: 2026, lender: "Bank Two" }, ctx)) as any;
    expect(bank2.totalInvoiced).toBe(20000);
    const one = (await getMonthlyBillingTool.execute!({ year: 2026, project: "Sea One" }, ctx)) as any;
    expect(one.scope).toMatch(/Sea One/);
    expect(one.totalReceived).toBe(30000);
    expect(((await getMonthlyBillingTool.execute!({ developer: "Nobody" }, ctx)) as any).error).toMatch(/No developer found/);
    const conflict = (await getMonthlyBillingTool.execute!({ developer: "HVN", project: "Sea One" }, ctx)) as any;
    expect(conflict.error).toMatch(/not in the requested/);
  });

  it("only returns the requested year", async () => {
    const r = (await getMonthlyBillingTool.execute!({ year: 2025 }, ctx)) as any;
    expect(r.months).toEqual([]);
    expect(r.totalInvoiced).toBe(0);
  });
});

describe("payments over a period", () => {
  it("returns every payment in an inclusive range with totals and a per-project split", async () => {
    const r = (await getRecentPaymentsTool.execute!({ startDate: "2026-10-01", endDate: "2026-10-05" }, ctx)) as any;
    expect(r.payments.map((p: any) => [p.project, p.receivedOn, p.amountReceived])).toEqual([
      ["Sea One", "2026-10-03", 30000],
      ["Hvn One", "2026-10-05", 40000],
    ]);
    expect(r.totalReceived).toBe(70000);
    expect(r.byProject[0]).toEqual({ project: "Hvn One", totalReceived: 40000, payments: 1 });
  });

  it("defaults the end of a period to today and the start to the beginning of time", async () => {
    const r = (await getRecentPaymentsTool.execute!({ startDate: "2026-10-01" }, ctx)) as any;
    expect(r.period).toEqual({ startDate: "2026-10-01", endDate: "2026-10-20" });
    expect(r.totalReceived).toBe(70000);
    const all = (await getRecentPaymentsTool.execute!({ endDate: "2026-09-30" }, ctx)) as any;
    expect(all.period.startDate).toBeNull();
    expect(all.totalReceived).toBe(80000);
  });

  it("developer and lender narrow a period", async () => {
    const r = (await getRecentPaymentsTool.execute!({ startDate: "2026-09-01", developer: "HVN" }, ctx)) as any;
    expect(r.totalReceived).toBe(120000);
    const lender = (await getRecentPaymentsTool.execute!({ startDate: "2026-09-01", lender: "Bank Two" }, ctx)) as any;
    expect(lender.totalReceived).toBe(20000);
  });

  it("the single-date form still works, with scope", async () => {
    const r = (await getRecentPaymentsTool.execute!({ date: "2026-10-03" }, ctx)) as any;
    expect(r.date).toBe("2026-10-03");
    expect(r.payments).toHaveLength(1);
    expect(r.scope).toMatch(/all projects/i);
    const today = (await getRecentPaymentsTool.execute!({}, ctx)) as any;
    expect(today.date).toBe("2026-10-20");
  });
});

describe("lender", () => {
  it("listProjects shows each project's lender", async () => {
    const r = (await listProjectsTool.execute!({}, ctx)) as any;
    expect(r.projects.find((p: any) => p.name === "Hvn Two Closed").lender).toBe("Bank Two");
  });

  it("getLenderSummary reports that lender's projects only, drafts separate", async () => {
    const r = (await getLenderSummaryTool.execute!({ lender: "bank one" }, ctx)) as any;
    expect(r.lender).toBe("Bank One");
    expect(r.projects.map((p: any) => p.project).sort()).toEqual(["Hvn One", "Sea One"]);
    expect(r.totals).toMatchObject({
      invoicedToDate: 100000 + 50000 + 30000 + 70000,
      paidToDate: 130000,
      outstanding: 50000 + 70000,
      draftsNotYetSubmitted: 80000,
    });
    expect(((await getLenderSummaryTool.execute!({ lender: "Nobody" }, ctx)) as any).error).toMatch(/No lender found/);
  });

  it("open draws, aging and outstanding accept a lender, and combine it with a developer", async () => {
    const open = (await getOpenDrawsTool.execute!({ lender: "Bank Two" }, ctx)) as any[];
    expect(open).toEqual([]);
    const both = (await getOpenDrawsTool.execute!({ lender: "Bank One", developer: "HVN" }, ctx)) as any[];
    expect(new Set(both.map((d) => d.project))).toEqual(new Set(["Hvn One"]));
    expect(both.every((d) => d.lender === "Bank One")).toBe(true);
    const aging = (await getAgingSummaryTool.execute!({ lender: "Bank One" }, ctx)) as any;
    expect(aging.scope).toMatch(/Lender Bank One/);
    const out = (await getOutstandingSummaryTool.execute!({ lender: "Bank One", developer: "HVN" }, ctx)) as any;
    expect(out.scope).toMatch(/Developer HVN and Lender Bank One/);
    expect(out.outstanding.total).toBe(50000);
    expect(((await getOutstandingSummaryTool.execute!({ lender: "Nobody" }, ctx)) as any).error).toMatch(/No lender found/);
  });
});
