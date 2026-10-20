/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are loosely typed JSON in these assertions */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables),
}));

const { getDeveloperSummaryTool, getOpenDrawsTool, getOutstandingSummaryTool, getAgingSummaryTool, listProjectsTool } =
  await import("@/lib/tools/read-tools");
const { matchDeveloper } = await import("@/lib/tools/shared");

const ctx = { toolCallId: "t", messages: [], context: undefined as never };

const project = (id: string, name: string, developer: string | null, status = "active"): Row => ({
  id, name, project_number: id, address: null, lender: null, developer, status,
  created_at: "2026-01-01T00:00:00Z", draw_due_type: null, draw_due_day: null, draw_skip_month: null,
});

const draw = (id: string, projectId: string, n: number, o: Row): Row => ({
  id, project_id: projectId, draw_number: n, amount_requested: 0, amount_approved: 0, retainage_held: 0,
  amount_paid: 0, date_paid: null, date_submitted: "2026-09-01", date_approved: null, status: "approved",
  notes: null, created_at: "2026-09-01T00:00:00Z", deleted_at: null, ...o,
});

// Synthetic. Two HVN projects (one closed) and one other developer's project.
beforeEach(() => {
  tables = {
    inv_projects: [
      project("H1", "Hvn One", "HVN"),
      project("H2", "Hvn Two Closed", "HVN", "closed"),
      project("S1", "Sea One", "SeaChange"),
      project("N1", "No Developer", null),
    ],
    inv_owner_draws: [
      // H1: one paid draw, one unpaid approved draw, one draft
      draw("h1a", "H1", 1, { amount_requested: 100000, amount_paid: 100000, status: "paid", retainage_held: 10000 }),
      draw("h1b", "H1", 2, { amount_requested: 60000, status: "approved", retainage_held: 6000 }),
      draw("h1c", "H1", 3, { amount_requested: 40000, status: "draft", retainage_held: 4000 }),
      // H2 (closed): unpaid balance and a $40 residual on another draw
      draw("h2a", "H2", 1, { amount_requested: 25000, status: "submitted" }),
      draw("h2b", "H2", 2, { amount_requested: 50040, amount_paid: 50000, status: "paid" }),
      // Another developer's money must never appear in HVN answers
      draw("s1a", "S1", 1, { amount_requested: 900000, status: "approved" }),
    ],
    inv_project_budget_lines: [],
    inv_draw_line_allocations: [],
    inv_draw_payments: [],
  };
});

describe("matchDeveloper", () => {
  const projects = [{ developer: "HVN" }, { developer: "SeaChange" }, { developer: "Hi Point - Winnie Zhang" }, { developer: null }];
  it("matches ignoring case and whitespace", () => {
    expect(matchDeveloper("  hvn ", projects)).toEqual({ developer: "HVN" });
  });
  it("accepts a single partial match", () => {
    expect(matchDeveloper("sea", projects)).toEqual({ developer: "SeaChange" });
  });
  it("reports ambiguity and unknown names with the real options", () => {
    const amb = matchDeveloper("h", projects) as { error: string };
    expect(amb.error).toMatch(/Multiple developers match/);
    const none = matchDeveloper("zzz", projects) as { error: string };
    expect(none.error).toMatch(/Developers on file: HVN, Hi Point - Winnie Zhang, SeaChange/);
  });
});

describe("getDeveloperSummary", () => {
  it("answers 'what have we invoiced for HVN' for HVN's projects only", async () => {
    const r = (await getDeveloperSummaryTool.execute!({ developer: "hvn" }, ctx)) as any;
    expect(r.developer).toBe("HVN");
    expect(r.scope).toMatch(/HVN.*projects only.*active and closed/i);
    expect(r.projects.map((p: any) => p.project).sort()).toEqual(["Hvn One", "Hvn Two Closed"]);
    // Invoiced = submitted/approved/paid requested amounts; the $40,000 draft is excluded.
    expect(r.totals.invoicedToDate).toBe(100000 + 60000 + 25000 + 50040);
    expect(r.totals.paidToDate).toBe(150000);
    expect(r.totals.outstanding).toBe(60000 + 25000 + 40);
    expect(r.totals.retainageHeld).toBe(16000);
    expect(r.totals.draftsNotYetSubmitted).toBe(40000);
  });

  it("includes the closed project's debt and never another developer's draws", async () => {
    const r = (await getDeveloperSummaryTool.execute!({ developer: "HVN" }, ctx)) as any;
    const projects = r.unpaidDraws.map((d: any) => d.project);
    expect(projects).toContain("Hvn Two Closed");
    expect(projects).not.toContain("Sea One");
    expect(r.unpaidDraws.find((d: any) => d.project === "Hvn Two Closed").projectStatus).toBe("closed");
    expect(r.smallBalancesNotListed).toEqual([{ project: "Hvn Two Closed", drawNumber: 2, balance: 40 }]);
  });

  it("returns an error listing real developers for an unknown name", async () => {
    const r = (await getDeveloperSummaryTool.execute!({ developer: "Nobody" }, ctx)) as any;
    expect(r.error).toMatch(/No developer found/);
    expect(r.error).toContain("HVN");
  });
});

describe("the other read tools accept a developer", () => {
  it("getOpenDraws narrows to the developer and tags each draw with it; omitted keeps everything", async () => {
    const hvn = (await getOpenDrawsTool.execute!({ developer: "HVN" }, ctx)) as any[];
    expect(hvn.every((d) => d.developer === "HVN")).toBe(true);
    // (drafts ride along in this list, so a project can appear more than once)
    expect([...new Set(hvn.map((d) => d.project))].sort()).toEqual(["Hvn One", "Hvn Two Closed"]);
    const all = (await getOpenDrawsTool.execute!({}, ctx)) as any[];
    expect(all.some((d) => d.project === "Sea One")).toBe(true);
  });

  it("getOutstandingSummary scopes totals, closed debt and residuals to the developer", async () => {
    const r = (await getOutstandingSummaryTool.execute!({ developer: "HVN" }, ctx)) as any;
    expect(r.scope).toMatch(/HVN/);
    expect(r.outstanding).toEqual({ total: 85040, activeProjects: 60000, closedProjects: 25040 });
    expect(r.residualBalances.draws).toHaveLength(1);
    const everyone = (await getOutstandingSummaryTool.execute!({}, ctx)) as any;
    expect(everyone.outstanding.total).toBe(85040 + 900000);
  });

  it("getAgingSummary scopes to the developer and says so", async () => {
    const r = (await getAgingSummaryTool.execute!({ developer: "HVN" }, ctx)) as any;
    expect(r.scope).toMatch(/HVN/);
    expect(r.draws.every((d: any) => ["Hvn One", "Hvn Two Closed"].includes(d.project))).toBe(true);
  });

  it("an unknown developer is an error, not silently everything", async () => {
    expect(((await getOpenDrawsTool.execute!({ developer: "Nobody" }, ctx)) as any).error).toMatch(/No developer found/);
    expect(((await getAgingSummaryTool.execute!({ developer: "Nobody" }, ctx)) as any).error).toMatch(/No developer found/);
    expect(((await getOutstandingSummaryTool.execute!({ developer: "Nobody" }, ctx)) as any).error).toMatch(/No developer found/);
  });

  it("listProjects exposes each project's developer", async () => {
    const r = (await listProjectsTool.execute!({}, ctx)) as any;
    expect(r.projects.find((p: any) => p.name === "Hvn One").developer).toBe("HVN");
  });
});
