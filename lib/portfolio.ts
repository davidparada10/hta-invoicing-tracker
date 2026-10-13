// Pure portfolio math for the dashboard's Active / All view and for the
// "what is still owed" figures that must NOT depend on that view. No database
// access here — callers hand in per-project rollups (lib/data.ts) so the same
// rules are unit-tested and shared by the page, the close warning and the AI
// tools.

import type { ProjectRollup, ProjectStatus } from "@/lib/types";

export type StatusScope = "active" | "all";

const CENT = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function inScope(status: ProjectStatus, scope: StatusScope): boolean {
  return scope === "all" || status === "active";
}

export function rollupsInScope(rollups: ProjectRollup[], scope: StatusScope): ProjectRollup[] {
  return rollups.filter((r) => inScope(r.project.status, scope));
}

export interface ScopeTotals {
  projectCount: number;
  closedProjectCount: number;
  totalBudget: number;
  totalPaidToOwner: number;
  totalRetainage: number;
  totalDraft: number;
  balanceToComplete: number;
  /** Share of the contract billed (paid + open + retainage); null with no contract value. */
  pctBilled: number | null;
}

// The dashboard's portfolio summary for the selected Active / All scope. The
// table, its developer subtotals and this summary all use rollupsInScope, so
// they can never describe different sets of projects.
export function scopeTotals(rollups: ProjectRollup[], scope: StatusScope): ScopeTotals {
  const rows = rollupsInScope(rollups, scope);
  const totalBudget = sum(rows.map((r) => r.totalBudget));
  const totalPaidToOwner = sum(rows.map((r) => r.totalPaidToOwner));
  const totalOpen = sum(rows.map((r) => r.totalOpenToOwner));
  const totalRetainage = sum(rows.map((r) => r.totalDrawRetainage));
  return {
    projectCount: rows.length,
    closedProjectCount: rows.filter((r) => r.project.status === "closed").length,
    totalBudget,
    totalPaidToOwner,
    totalRetainage,
    totalDraft: sum(rows.map((r) => r.totalDraft)),
    balanceToComplete: totalBudget - totalPaidToOwner - totalOpen - totalRetainage,
    pctBilled:
      totalBudget > 0 ? (totalPaidToOwner + totalOpen + totalRetainage) / totalBudget : null,
  };
}

export interface HeldRetainage {
  projectId: string;
  projectName: string;
  amount: number;
}

export interface OutstandingAcrossAll {
  /** Collectible balances on every project's non-draft draws, per-draw floored (drafts excluded). */
  total: number;
  active: number;
  closed: number;
  /** Retainage is tracked separately and is never added to `total`. */
  retainageTotal: number;
  retainageActive: number;
  retainageClosed: number;
  closedWithRetainage: HeldRetainage[];
}

// "Outstanding across all projects": independent of the Active/All toggle and
// of table search by construction — it only ever sees the full rollup list.
export function outstandingAcrossAll(rollups: ProjectRollup[]): OutstandingAcrossAll {
  const active = rollups.filter((r) => r.project.status === "active");
  const closed = rollups.filter((r) => r.project.status === "closed");
  const open = (rows: ProjectRollup[]) => round2(sum(rows.map((r) => r.totalOpenToOwner)));
  const held = (rows: ProjectRollup[]) => round2(sum(rows.map((r) => r.totalDrawRetainage)));
  return {
    total: open(rollups),
    active: open(active),
    closed: open(closed),
    retainageTotal: held(rollups),
    retainageActive: held(active),
    retainageClosed: held(closed),
    closedWithRetainage: closed
      .filter((r) => r.totalDrawRetainage > CENT)
      .map((r) => ({
        projectId: r.project.id,
        projectName: r.project.name,
        amount: round2(r.totalDrawRetainage),
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export interface ResidualBalance {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  drawNumber: number;
  balance: number;
}

// Balances at or under the alert threshold still count toward Outstanding but
// are not listed in Open Draws or aging alerts (they would be noise there).
// This keeps them findable instead of silently carried.
export function residualBalances(
  entries: (ResidualBalance & { status: string })[],
  threshold: number
): ResidualBalance[] {
  return entries
    .filter((e) => e.status !== "draft" && e.balance > CENT && e.balance <= threshold)
    .map(({ status: _status, ...rest }) => {
      void _status;
      return { ...rest, balance: round2(rest.balance) };
    })
    .sort((a, b) => b.balance - a.balance);
}

export interface ClosingSummary {
  /** Collectible balance still owed on the project's draws (any positive amount, however small). */
  collectible: number;
  /** Retainage still held on the project (never negative). */
  retainage: number;
  /** True when closing should show a notice: either amount is positive. */
  needsNotice: boolean;
}

// What a user should see before closing a project. Deliberately has NO alert
// threshold: a $40 residual is still money owed. Drafts hold nothing.
export function closingSummary(
  draws: { status: string; balance: number; retainage: number }[]
): ClosingSummary {
  const live = draws.filter((d) => d.status !== "draft");
  const collectible = round2(sum(live.map((d) => Math.max(0, d.balance))));
  const retainage = round2(Math.max(0, sum(live.map((d) => d.retainage))));
  return { collectible, retainage, needsNotice: collectible > CENT || retainage > CENT };
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// The text of the confirmation shown when closing. Amounts are separate lines
// and a zero amount is omitted. Returns null when nothing is owed or held.
export function closeNoticeMessage(projectName: string, s: ClosingSummary): string | null {
  if (!s.needsNotice) return null;
  const lines = [`Close ${projectName}?`, ""];
  if (s.collectible > CENT) lines.push(`Still collectible from the owner: ${usd(s.collectible)}`);
  if (s.retainage > CENT) lines.push(`Retainage still held: ${usd(s.retainage)}`);
  lines.push(
    "",
    "Closing stops new-draw reminders. These amounts stay tracked: collectible balances remain in Outstanding across all projects, Open Draws and aging alerts, and retainage stays in the all-project retainage figure.",
    "Nothing is marked paid, released or written off."
  );
  return lines.join("\n");
}

// ---- Dashboard table: scope + search + developer grouping -------------------
// One implementation so the table rows, the developer subtotals and the
// "N of M match" labels all start from the same Active/All project set.

export const UNASSIGNED_GROUP = "Unassigned";

export function visibleProjects(
  rollups: ProjectRollup[],
  scope: StatusScope,
  search: string
): ProjectRollup[] {
  const q = search.trim().toLowerCase();
  return rollupsInScope(rollups, scope).filter((r) => {
    if (!q) return true;
    return (
      r.project.name.toLowerCase().includes(q) ||
      (r.project.address ?? "").toLowerCase().includes(q) ||
      (r.project.developer ?? "").toLowerCase().includes(q)
    );
  });
}

export function sumRollups(rows: ProjectRollup[]) {
  return {
    totalOpenToOwner: sum(rows.map((r) => r.totalOpenToOwner)),
    totalPaidToOwner: sum(rows.map((r) => r.totalPaidToOwner)),
    totalBudget: sum(rows.map((r) => r.totalBudget)),
    balanceToComplete: sum(rows.map((r) => r.balanceToComplete)),
    totalDrawRetainage: sum(rows.map((r) => r.totalDrawRetainage)),
    hasMeaningfulOpenBalance: rows.some((r) => r.hasMeaningfulOpenBalance),
  };
}

// Alphabetical, with projects that have no developer always last.
export function developerGroups(rows: ProjectRollup[]) {
  const byDeveloper = new Map<string, ProjectRollup[]>();
  for (const r of rows) {
    const key = r.project.developer ?? UNASSIGNED_GROUP;
    const existing = byDeveloper.get(key);
    if (existing) existing.push(r);
    else byDeveloper.set(key, [r]);
  }
  return [...byDeveloper.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED_GROUP) return 1;
      if (b === UNASSIGNED_GROUP) return -1;
      return a.localeCompare(b);
    })
    .map(([developer, groupRows]) => ({ developer, rows: groupRows, totals: sumRollups(groupRows) }));
}

// Per-developer project counts for the selected scope, ignoring search, for
// "N of M projects match" while a search is active.
export function developerGroupSizes(rollups: ProjectRollup[], scope: StatusScope): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const r of rollupsInScope(rollups, scope)) {
    const key = r.project.developer ?? UNASSIGNED_GROUP;
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  return sizes;
}
