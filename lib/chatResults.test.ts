import { describe, expect, it } from "vitest";
import { describeGroupSummary, fallbackAnswer } from "@/lib/chatResults";

// The shape summarizeGroup() in lib/tools/read-tools.ts returns, with the HVN
// figures from production.
const hvn = {
  scope: "Developer HVN: its projects only, active and closed",
  developer: "HVN",
  totals: {
    invoicedToDate: 1659454.11,
    paidToDate: 1058030.04,
    outstanding: 601424.07,
    retainageHeld: 78980.54,
    draftsNotYetSubmitted: 0,
  },
  projects: [
    { project: "12442 Pacific", status: "active", invoicedToDate: 256073.33, paidToDate: 150907.5, outstanding: 105165.83, retainageHeld: 11000, draftsNotYetSubmitted: 0 },
    { project: "3608 Centinela", status: "active", invoicedToDate: 278041.16, paidToDate: 142500, outstanding: 135541.16, retainageHeld: 9000, draftsNotYetSubmitted: 0 },
    { project: "Old Closed Job", status: "closed", invoicedToDate: 100, paidToDate: 100, outstanding: 0, retainageHeld: 0, draftsNotYetSubmitted: 0 },
  ],
  unpaidDraws: [{ project: "12442 Pacific" }, { project: "3608 Centinela" }],
  smallBalancesNotListed: [{ project: "Old Closed Job", drawNumber: 1, balance: 40 }],
};

describe("describeGroupSummary", () => {
  it("labels paid, invoiced, outstanding and retainage for a developer", () => {
    const v = describeGroupSummary("getDeveloperSummary", hvn);
    if (v.kind !== "group") throw new Error("expected a group view");
    expect(v.groupType).toBe("Developer");
    expect(v.name).toBe("HVN");
    expect(v.stats).toEqual([
      { label: "Invoiced", value: 1659454.11 },
      { label: "Paid", value: 1058030.04 },
      { label: "Outstanding", value: 601424.07 },
      { label: "Retainage held", value: 78980.54 },
    ]);
    expect(v.headline).toContain("$1,058,030.04 paid of $1,659,454.11 invoiced");
    expect(v.headline).toContain("$601,424.07 outstanding");
    expect(v.headline).toContain("$78,980.54");
    // Active/closed scope is preserved: the closed project is tagged and counted.
    expect(v.headline).toContain("3 projects (1 closed)");
    expect(v.projects.map((p) => [p.project, p.closed])).toEqual([
      ["12442 Pacific", false],
      ["3608 Centinela", false],
      ["Old Closed Job", true],
    ]);
    expect(v.scope).toMatch(/active and closed/);
    expect(v.unpaidDrawCount).toBe(2);
    expect(v.smallBalanceCount).toBe(1);
  });

  it("does not recompute figures: totals are shown exactly as the tool returned them", () => {
    const v = describeGroupSummary("getDeveloperSummary", {
      ...hvn,
      totals: { ...hvn.totals, paidToDate: 1 }, // deliberately not the sum of the rows
    });
    if (v.kind !== "group") throw new Error("expected a group view");
    expect(v.stats.find((s) => s.label === "Paid")?.value).toBe(1);
  });

  it("describes a lender summary", () => {
    const { developer: _d, ...rest } = hvn;
    void _d;
    const v = describeGroupSummary("getLenderSummary", { ...rest, lender: "Acme Bank", scope: "Lender Acme Bank: its projects only, active and closed" });
    if (v.kind !== "group") throw new Error("expected a group view");
    expect(v.groupType).toBe("Lender");
    expect(v.name).toBe("Acme Bank");
    expect(v.headline.startsWith("Acme Bank, across")).toBe(true);
  });

  it("handles a group with a single project and no closed projects", () => {
    const v = describeGroupSummary("getDeveloperSummary", { ...hvn, projects: [hvn.projects[0]] });
    if (v.kind !== "group") throw new Error("expected a group view");
    expect(v.headline).toContain("1 project:");
  });

  it("falls back to an unsupported view for a result it cannot read", () => {
    for (const bad of [null, [], "text", {}, { totals: {}, projects: [] }, { developer: "HVN", totals: { paidToDate: "x" }, projects: [] }]) {
      const v = describeGroupSummary("getDeveloperSummary", bad);
      expect(v).toMatchObject({ kind: "unsupported", toolName: "getDeveloperSummary" });
    }
  });
});

describe("fallbackAnswer", () => {
  it("states the group result when the assistant wrote nothing", () => {
    expect(fallbackAnswer([{ toolName: "getDeveloperSummary", output: hvn }], false)).toContain("$1,058,030.04 paid");
  });
  it("is never empty for an unsupported result or an error", () => {
    expect(fallbackAnswer([{ toolName: "somethingNew", output: { a: 1 } }], false)).toMatch(/didn't write an answer/);
    expect(fallbackAnswer([], true)).toMatch(/couldn't finish/);
  });
});
