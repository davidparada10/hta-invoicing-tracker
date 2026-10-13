import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_GROUP,
  closeNoticeMessage,
  developerGroupSizes,
  developerGroups,
  visibleProjects,
  closingSummary,
  inScope,
  outstandingAcrossAll,
  residualBalances,
  rollupsInScope,
  scopeTotals,
} from "@/lib/portfolio";
import type { ProjectRollup } from "@/lib/types";

function rollup(id: string, status: "active" | "closed", o: Partial<ProjectRollup> = {}): ProjectRollup {
  return {
    project: { id, name: `Project ${id}`, status } as ProjectRollup["project"],
    totalRequested: 0,
    totalApproved: 0,
    totalDrawRetainage: 0,
    totalPaidToOwner: 0,
    totalOpenToOwner: 0,
    hasMeaningfulOpenBalance: false,
    totalDraft: 0,
    totalBudget: 0,
    balanceToComplete: 0,
    isDrawOverdue: false,
    isDrawUrgent: false,
    nextDrawLabel: null,
    drawOverdueDays: null,
    drawCycleSatisfiedLabel: null,
    ...o,
  };
}

const fixtures = [
  rollup("A", "active", { totalBudget: 1000, totalPaidToOwner: 400, totalOpenToOwner: 100, totalDrawRetainage: 50, totalDraft: 20 }),
  rollup("B-settled", "closed", { totalBudget: 500, totalPaidToOwner: 450, totalOpenToOwner: 0, totalDrawRetainage: 0 }),
  rollup("C-unpaid", "closed", { totalBudget: 800, totalPaidToOwner: 300, totalOpenToOwner: 250, totalDrawRetainage: 40 }),
  rollup("D-retainage", "closed", { totalBudget: 600, totalPaidToOwner: 540, totalOpenToOwner: 0, totalDrawRetainage: 60 }),
  rollup("E-residual", "closed", { totalBudget: 300, totalPaidToOwner: 290, totalOpenToOwner: 40, totalDrawRetainage: 0, totalDraft: 5 }),
];

describe("Active / All scope", () => {
  it("Active keeps only active projects; All keeps every status", () => {
    expect(rollupsInScope(fixtures, "active").map((r) => r.project.id)).toEqual(["A"]);
    expect(rollupsInScope(fixtures, "all")).toHaveLength(5);
    expect(inScope("closed", "active")).toBe(false);
    expect(inScope("closed", "all")).toBe(true);
  });

  it("summary totals follow the scope: contract, paid, retainage, drafts, balance, count", () => {
    const active = scopeTotals(fixtures, "active");
    expect(active).toMatchObject({
      projectCount: 1,
      closedProjectCount: 0,
      totalBudget: 1000,
      totalPaidToOwner: 400,
      totalRetainage: 50,
      totalDraft: 20,
      balanceToComplete: 1000 - 400 - 100 - 50,
    });
    const all = scopeTotals(fixtures, "all");
    expect(all).toMatchObject({
      projectCount: 5,
      closedProjectCount: 4,
      totalBudget: 3200,
      totalPaidToOwner: 1980,
      totalRetainage: 150,
      totalDraft: 25,
    });
    expect(all.balanceToComplete).toBe(3200 - 1980 - 390 - 150);
  });

  it("closing an active project changes active totals and counts", () => {
    const before = scopeTotals(fixtures, "active");
    const closedA = fixtures.map((r) => (r.project.id === "A" ? { ...r, project: { ...r.project, status: "closed" as const } } : r));
    const after = scopeTotals(closedA, "active");
    expect(before.projectCount).toBe(1);
    expect(after.projectCount).toBe(0);
    expect(after.totalPaidToOwner).toBe(0);
    // ...and reopening restores them exactly.
    expect(scopeTotals(fixtures, "active")).toEqual(before);
  });

  it("an empty scope reports no percent billed instead of dividing by zero", () => {
    expect(scopeTotals([], "active").pctBilled).toBeNull();
  });
});

describe("Outstanding across all projects", () => {
  const o = outstandingAcrossAll(fixtures);

  it("includes closed-project balances and splits active from closed", () => {
    expect(o.total).toBe(390);
    expect(o.active).toBe(100);
    expect(o.closed).toBe(290);
  });

  it("tracks retainage separately and never adds it to outstanding", () => {
    expect(o.retainageTotal).toBe(150);
    expect(o.retainageActive).toBe(50);
    expect(o.retainageClosed).toBe(100);
    expect(o.total).toBe(390);
    expect(o.closedWithRetainage.map((p) => [p.projectName, p.amount])).toEqual([
      ["Project D-retainage", 60],
      ["Project C-unpaid", 40],
    ]);
  });

  it("is identical whatever the dashboard scope or search, because it only sees the full list", () => {
    const a = outstandingAcrossAll(fixtures);
    scopeTotals(fixtures, "active");
    expect(outstandingAcrossAll(fixtures)).toEqual(a);
  });

  it("changes when a project is closed only in its active/closed split, not the total", () => {
    const closedA = fixtures.map((r) => (r.project.id === "A" ? { ...r, project: { ...r.project, status: "closed" as const } } : r));
    const after = outstandingAcrossAll(closedA);
    expect(after.total).toBe(o.total);
    expect(after.retainageTotal).toBe(o.retainageTotal);
    expect(after.active).toBe(0);
    expect(after.closed).toBe(o.total);
  });
});

describe("residualBalances", () => {
  const entry = (balance: number, status = "approved", projectStatus: "active" | "closed" = "closed") => ({
    projectId: "p",
    projectName: "P",
    projectStatus,
    drawNumber: 1,
    status,
    balance,
  });

  it("lists positive balances at or under the threshold, largest first, and nothing else", () => {
    const list = residualBalances([entry(40), entry(1000), entry(1000.01), entry(0), entry(250)], 1000);
    expect(list.map((r) => r.balance)).toEqual([1000, 250, 40]);
  });

  it("skips drafts", () => {
    expect(residualBalances([entry(40, "draft")], 1000)).toEqual([]);
  });
});

describe("closing notice", () => {
  it("has no threshold: a $40 residual alone still needs a notice", () => {
    const s = closingSummary([{ status: "approved", balance: 40, retainage: 0 }]);
    expect(s).toEqual({ collectible: 40, retainage: 0, needsNotice: true });
    expect(closeNoticeMessage("P", s)).toContain("$40.00");
  });

  it("retainage alone needs a notice, and the two amounts are shown separately", () => {
    const both = closeNoticeMessage("P", closingSummary([{ status: "paid", balance: 250, retainage: 60 }]))!;
    expect(both).toContain("Still collectible from the owner: $250.00");
    expect(both).toContain("Retainage still held: $60.00");
    const onlyHeld = closeNoticeMessage("P", closingSummary([{ status: "paid", balance: 0, retainage: 60 }]))!;
    expect(onlyHeld).not.toContain("collectible from the owner");
  });

  it("states that nothing is paid, released or written off", () => {
    expect(closeNoticeMessage("P", closingSummary([{ status: "approved", balance: 5, retainage: 0 }]))).toMatch(
      /Nothing is marked paid, released or written off/
    );
  });

  it("asks nothing when both amounts are zero", () => {
    const s = closingSummary([{ status: "paid", balance: 0, retainage: 0 }]);
    expect(s.needsNotice).toBe(false);
    expect(closeNoticeMessage("P", s)).toBeNull();
  });

  it("ignores drafts and floors a released (negative) retainage total at zero", () => {
    expect(closingSummary([{ status: "draft", balance: 900, retainage: 90 }]).needsNotice).toBe(false);
    expect(closingSummary([{ status: "paid", balance: 0, retainage: 100 }, { status: "paid", balance: 0, retainage: -100 }]).retainage).toBe(0);
  });
});

describe("table search and developer grouping in both views", () => {
  const withMeta = (r: ProjectRollup, name: string, developer: string | null, address = "1 Main St") => ({
    ...r,
    project: { ...r.project, name, developer, address },
  });
  const rows = [
    withMeta(fixtures[0], "Delmas Terrace", "SeaChange"),
    withMeta(fixtures[1], "Delmas - Early Start", "SeaChange"),
    withMeta(fixtures[2], "Gilmore", "Logos"),
    withMeta(fixtures[3], "Corinth", null),
    withMeta(fixtures[4], "Valley", "Logos"),
  ];

  it("Active shows only active projects; All adds the closed ones", () => {
    expect(visibleProjects(rows, "active", "").map((r) => r.project.name)).toEqual(["Delmas Terrace"]);
    expect(visibleProjects(rows, "all", "")).toHaveLength(5);
  });

  it("search narrows rows inside the chosen view without leaking closed projects into Active", () => {
    expect(visibleProjects(rows, "active", "delmas").map((r) => r.project.name)).toEqual(["Delmas Terrace"]);
    expect(visibleProjects(rows, "all", "delmas").map((r) => r.project.name)).toEqual([
      "Delmas Terrace",
      "Delmas - Early Start",
    ]);
    expect(visibleProjects(rows, "all", "  SEACHANGE ")).toHaveLength(2);
  });

  it("developer subtotals use the same filtered set, with unassigned last", () => {
    const all = developerGroups(visibleProjects(rows, "all", ""));
    expect(all.map((g) => g.developer)).toEqual(["Logos", "SeaChange", UNASSIGNED_GROUP]);
    expect(all.find((g) => g.developer === "SeaChange")!.totals.totalOpenToOwner).toBe(100);

    const active = developerGroups(visibleProjects(rows, "active", ""));
    expect(active.map((g) => g.developer)).toEqual(["SeaChange"]);
    expect(active[0].totals.totalOpenToOwner).toBe(100);
    expect(active[0].rows).toHaveLength(1);
  });

  it("search changes group rows and subtotals but never the Active/All group sizes used for labels", () => {
    const sizesActive = developerGroupSizes(rows, "active");
    const sizesAll = developerGroupSizes(rows, "all");
    expect(sizesActive.get("SeaChange")).toBe(1);
    expect(sizesAll.get("SeaChange")).toBe(2);
    expect(developerGroups(visibleProjects(rows, "all", "early"))[0].rows).toHaveLength(1);
    expect(developerGroupSizes(rows, "all").get("SeaChange")).toBe(2);
  });

  it("summary totals ignore the search: they depend only on the scope", () => {
    const before = scopeTotals(rows, "all");
    visibleProjects(rows, "all", "valley");
    expect(scopeTotals(rows, "all")).toEqual(before);
  });
});
