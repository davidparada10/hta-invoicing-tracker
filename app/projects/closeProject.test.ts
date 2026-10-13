/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are loosely typed JSON in these assertions */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";
import { agingBucket, daysOpen } from "@/lib/aging";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { updateProjectStatus, updateProject, previewProjectClose } = await import("@/app/projects/actions");
const { getDashboardData, getOpenDraws } = await import("@/lib/data");
const { getOutstandingSummaryTool, listProjectsTool, getOpenDrawsTool, getAgingSummaryTool } = await import(
  "@/lib/tools/read-tools"
);
const { outstandingAcrossAll, scopeTotals } = await import("@/lib/portfolio");

const ctx = { toolCallId: "t", messages: [], context: undefined as never };

function project(id: string, name: string, status: "active" | "closed", cadence = false): Row {
  return {
    id,
    name,
    project_number: id,
    address: null,
    lender: null,
    developer: "Dev",
    status,
    created_at: "2026-01-01T00:00:00Z",
    draw_due_type: cadence ? "day_of_month" : null,
    draw_due_day: cadence ? 1 : null,
    draw_skip_month: null,
  };
}

function draw(id: string, projectId: string, o: Row): Row {
  return {
    id,
    project_id: projectId,
    draw_number: 1,
    amount_requested: 0,
    amount_approved: 0,
    retainage_held: 0,
    amount_paid: 0,
    date_paid: null,
    date_submitted: "2026-07-01",
    date_approved: null,
    status: "approved",
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    deleted_at: null,
    ...o,
  };
}

// Synthetic fixtures only.
//  A  active, with a draw cadence, one unpaid draw
//  B  closed, fully settled
//  C  closed, unpaid draw (old enough for an aging alert)
//  D  closed, retainage held but nothing open
//  E  closed, a $40 residual balance
function seed() {
  tables = {
    inv_projects: [
      project("A", "Alpha Active", "active", true),
      project("B", "Bravo Settled", "closed"),
      project("C", "Charlie Unpaid", "closed", true),
      project("D", "Delta Retainage", "closed"),
      project("E", "Echo Residual", "closed"),
    ],
    inv_owner_draws: [
      draw("dA", "A", { amount_requested: 100000, amount_approved: 100000, date_submitted: "2026-08-01" }),
      draw("dB", "B", { amount_requested: 50000, amount_approved: 50000, amount_paid: 50000, date_paid: "2026-08-01", status: "paid" }),
      draw("dC", "C", { amount_requested: 25000, amount_approved: 25000, date_submitted: "2026-07-01" }),
      draw("dD", "D", { amount_requested: 90000, amount_approved: 90000, amount_paid: 90000, retainage_held: 10000, date_paid: "2026-08-01", status: "paid" }),
      draw("dE", "E", { amount_requested: 50040, amount_approved: 50040, amount_paid: 50000, date_paid: "2026-08-01", status: "paid" }),
    ],
    inv_project_budget_lines: [],
    inv_draw_line_allocations: [],
    inv_draw_payments: [
      { id: "r1", draw_id: "dB", amount: 50000, date_received: "2026-08-01", source: "manual", idempotency_key: null, date_inferred: false, created_at: "2026-08-01T00:00:00Z", deleted_at: null },
    ],
  };
}

const snapshot = (names: string[]) => JSON.stringify(names.map((n) => tables[n]));
const FINANCIAL = ["inv_owner_draws", "inv_draw_payments", "inv_draw_line_allocations", "inv_project_budget_lines"];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  seed();
});
afterEach(() => vi.useRealTimers());

describe("closed projects stay in what is owed", () => {
  it("all-project outstanding includes the closed project's unpaid draw, split by status", async () => {
    const { rollups } = await getDashboardData();
    const o = outstandingAcrossAll(rollups);
    expect(o.active).toBe(100000);
    expect(o.closed).toBe(25040); // C 25,000 + E 40
    expect(o.total).toBe(125040);
    expect(o.retainageClosed).toBe(10000);
    expect(o.closedWithRetainage.map((p) => p.projectName)).toEqual(["Delta Retainage"]);
  });

  it("a closed project's balances are still in the Open Draws list and tagged closed", async () => {
    const open = await getOpenDraws();
    const c = open.find((d) => d.project.id === "C");
    expect(c?.project.status).toBe("closed");
    expect(open.some((d) => d.project.id === "A")).toBe(true);
    // Settled, retainage-only and sub-$1,000 residual projects are not listed here.
    expect(open.map((d) => d.project.id).sort()).toEqual(["A", "C"]);
  });

  it("the closed project's draw still qualifies for the 60+ day aging alert", async () => {
    const c = (await getOpenDraws()).find((d) => d.project.id === "C")!;
    const bucket = agingBucket(daysOpen(c.date_submitted ?? c.created_at));
    expect(["61-90", "90+"]).toContain(bucket);
  });

  it("the $40 residual is counted but listed in the residual breakdown, not in Open Draws", async () => {
    const { residuals, totals } = await getDashboardData();
    expect(residuals).toEqual([
      { projectId: "E", projectName: "Echo Residual", projectStatus: "closed", drawNumber: 1, balance: 40 },
    ]);
    expect(totals.totalOpenToOwner).toBe(125040);
  });
});

describe("closing and reopening", () => {
  it("closing changes active-portfolio totals and counts but not all-project outstanding or history", async () => {
    const before = await getDashboardData();
    const activeBefore = scopeTotals(before.rollups, "active");
    const oBefore = outstandingAcrossAll(before.rollups);

    await updateProjectStatus("A", "closed");

    const after = await getDashboardData();
    const activeAfter = scopeTotals(after.rollups, "active");
    const oAfter = outstandingAcrossAll(after.rollups);

    expect(activeBefore.projectCount).toBe(1);
    expect(activeAfter.projectCount).toBe(0);
    expect(oAfter.total).toBe(oBefore.total);
    expect(oAfter.closed).toBe(oBefore.total);
    expect(after.totals).toEqual(before.totals);
    expect(scopeTotals(after.rollups, "all")).toEqual(scopeTotals(before.rollups, "all"));
  });

  it("closing never changes a draw, receipt, allocation or budget line", async () => {
    const before = snapshot(FINANCIAL);
    await updateProjectStatus("A", "closed");
    await updateProjectStatus("C", "active");
    const form = new FormData();
    form.set("id", "E");
    form.set("name", "Echo Residual");
    form.set("status", "active");
    await updateProject(form);
    await previewProjectClose("C");
    expect(snapshot(FINANCIAL)).toBe(before);
  });

  it("cadence reminders stop when closed and resume when reopened", async () => {
    let { rollups } = await getDashboardData();
    const find = (id: string) => rollups.find((r) => r.project.id === id)!;
    expect(find("A").isDrawOverdue).toBe(true);
    expect(find("A").nextDrawLabel).not.toBeNull();
    // C has a cadence configured but is closed: no reminders at all.
    expect(find("C").isDrawOverdue).toBe(false);
    expect(find("C").isDrawUrgent).toBe(false);
    expect(find("C").nextDrawLabel).toBeNull();

    await updateProjectStatus("A", "closed");
    ({ rollups } = await getDashboardData());
    expect(find("A").isDrawOverdue).toBe(false);
    expect(find("A").nextDrawLabel).toBeNull();

    await updateProjectStatus("A", "active");
    ({ rollups } = await getDashboardData());
    expect(find("A").isDrawOverdue).toBe(true);
    expect(find("A").nextDrawLabel).not.toBeNull();
  });
});

describe("what the close notice reports", () => {
  it("reports each project's real amounts with no threshold", async () => {
    expect(await previewProjectClose("A")).toEqual({ collectible: 100000, retainage: 0, needsNotice: true });
    expect(await previewProjectClose("B")).toEqual({ collectible: 0, retainage: 0, needsNotice: false });
    expect(await previewProjectClose("C")).toEqual({ collectible: 25000, retainage: 0, needsNotice: true });
    expect(await previewProjectClose("D")).toEqual({ collectible: 0, retainage: 10000, needsNotice: true });
    expect(await previewProjectClose("E")).toEqual({ collectible: 40, retainage: 0, needsNotice: true });
  });

  it("is read-only", async () => {
    const before = snapshot([...FINANCIAL, "inv_projects"]);
    await previewProjectClose("C");
    expect(snapshot([...FINANCIAL, "inv_projects"])).toBe(before);
  });
});

describe("assistant tools carry scope and keep closed-project debt", () => {
  it("getOutstandingSummary answers 'what is still owed' across all projects", async () => {
    const r = (await getOutstandingSummaryTool.execute!({}, ctx)) as Record<string, any>;
    expect(r.scope).toMatch(/active and closed/i);
    expect(r.outstanding).toEqual({ total: 125040, activeProjects: 100000, closedProjects: 25040 });
    expect(r.retainageHeld.total).toBe(10000);
    expect(r.retainageHeld.closedProjectsHoldingRetainage).toEqual([
      { project: "Delta Retainage", retainageHeld: 10000 },
    ]);
    expect(r.residualBalances.draws).toEqual([
      { project: "Echo Residual", projectStatus: "closed", drawNumber: 1, balance: 40 },
    ]);
    expect(r.closedProjectsWithOutstanding.map((p: any) => p.project).sort()).toEqual([
      "Charlie Unpaid",
      "Echo Residual",
    ]);
  });

  it("closing a project does not change the assistant's outstanding answer", async () => {
    const run = async () => ((await getOutstandingSummaryTool.execute!({}, ctx)) as any).outstanding.total;
    const before = await run();
    await updateProjectStatus("A", "closed");
    expect(await run()).toBe(before);
  });

  it("listProjects separates active-portfolio totals from all-project totals", async () => {
    const r = (await listProjectsTool.execute!({}, ctx)) as Record<string, any>;
    expect(r.scope).toMatch(/active and closed/i);
    expect(r.activeTotals.scope).toMatch(/active projects only/i);
    expect(r.activeTotals.projectCount).toBe(1);
    expect(r.closedProjectCount).toBe(4);
    expect(r.totals.totalOpenToOwner).toBe(125040);
  });

  it("open draws and aging mark closed projects instead of hiding them", async () => {
    const open = (await getOpenDrawsTool.execute!({}, ctx)) as any[];
    expect(open.find((d) => d.project === "Charlie Unpaid").projectStatus).toBe("closed");
    const aging = (await getAgingSummaryTool.execute!({}, ctx)) as Record<string, any>;
    expect(aging.scope).toMatch(/active and closed/i);
    expect(aging.draws.find((d: any) => d.project === "Charlie Unpaid").projectStatus).toBe("closed");
  });
});
