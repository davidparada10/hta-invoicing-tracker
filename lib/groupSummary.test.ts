import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({}) }));

const { buildGroupSummary } = await import("@/lib/groupSummary");
const { groupSlug, findGroupBySlug } = await import("@/lib/groupSlug");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rollup = (id: string, name: string, developer: string, status: string, o: Record<string, number>): any => ({
  project: { id, name, developer, lender: null, status },
  totalRequested: 0, totalDraft: 0, totalPaidToOwner: 0, totalOpenToOwner: 0, totalDrawRetainage: 0,
  ...o,
});

const rollups = [
  rollup("a", "Alpha", "HVN", "active", { totalRequested: 1000, totalDraft: 200, totalPaidToOwner: 500, totalOpenToOwner: 300, totalDrawRetainage: 50 }),
  rollup("b", "Beta", "HVN", "closed", { totalRequested: 400, totalPaidToOwner: 400, totalDrawRetainage: 10 }),
  rollup("c", "Gamma", "Other", "active", { totalRequested: 9999, totalPaidToOwner: 9999 }),
];

describe("buildGroupSummary", () => {
  it("adds up one developer's active and closed projects only, drafts excluded from invoiced", () => {
    const s = buildGroupSummary("developer", "HVN", rollups, [], []);
    expect(s.totals).toEqual({
      invoicedToDate: 1200, // 1000 - 200 draft + 400
      paidToDate: 900,
      outstanding: 300,
      retainageHeld: 60,
      draftsNotYetSubmitted: 200,
    });
    expect(s.projects.map((p) => [p.project, p.status])).toEqual([["Alpha", "active"], ["Beta", "closed"]]);
    expect(s.scope).toMatch(/active and closed/);
  });
});

describe("developer page address", () => {
  it("makes a stable slug and finds the developer from it", () => {
    expect(groupSlug("Hi Point - Winnie Zhang")).toBe("hi-point-winnie-zhang");
    expect(groupSlug("  HVN ")).toBe("hvn");
    const names = ["HVN", "Hi Point - Winnie Zhang", null];
    expect(findGroupBySlug("hvn", names)).toBe("HVN");
    expect(findGroupBySlug("hi-point-winnie-zhang", names)).toBe("Hi Point - Winnie Zhang");
    expect(findGroupBySlug("HVN%20", names)).toBe("HVN");
    expect(findGroupBySlug("nobody", names)).toBeNull();
    expect(findGroupBySlug("", names)).toBeNull();
  });
});
