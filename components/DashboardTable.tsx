"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ProjectRollup } from "@/lib/types";
import { formatCurrency, formatCurrencyRounded } from "@/lib/format";
import { dashboardAddressLine } from "@/lib/address";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";

// No-developer-set projects sort after every named group, but still need a
// stable, distinct key from an actual (possibly falsy-looking) developer
// name — an empty string, not null/undefined, so it sorts predictably.
const UNASSIGNED_GROUP = "Unassigned";

function sumGroup(rows: ProjectRollup[]) {
  return {
    totalOpenToOwner: rows.reduce((acc, r) => acc + r.totalOpenToOwner, 0),
    totalPaidToOwner: rows.reduce((acc, r) => acc + r.totalPaidToOwner, 0),
    totalBudget: rows.reduce((acc, r) => acc + r.totalBudget, 0),
    balanceToComplete: rows.reduce((acc, r) => acc + r.balanceToComplete, 0),
    totalDrawRetainage: rows.reduce((acc, r) => acc + r.totalDrawRetainage, 0),
    hasMeaningfulOpenBalance: rows.some((r) => r.hasMeaningfulOpenBalance),
  };
}

export default function DashboardTable({ rollups }: { rollups: ProjectRollup[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [groupByDeveloper, setGroupByDeveloper] = useState(true);
  const showStatusColumn = statusFilter === "all";
  const columnCount = showStatusColumn ? 7 : 6;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rollups.filter((r) => {
      if (statusFilter === "active" && r.project.status !== "active") return false;
      if (!q) return true;
      return (
        r.project.name.toLowerCase().includes(q) ||
        (r.project.address ?? "").toLowerCase().includes(q) ||
        (r.project.developer ?? "").toLowerCase().includes(q)
      );
    });
  }, [rollups, search, statusFilter]);

  // Grouped by developer, alphabetically, with unassigned projects (no
  // developer set) always last rather than sorting in wherever "Unassigned"
  // happens to fall — they're the exception, not just another group.
  const groups = useMemo(() => {
    if (!groupByDeveloper) return [{ developer: null, rows: filtered }];
    const byDeveloper = new Map<string, ProjectRollup[]>();
    for (const r of filtered) {
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
      .map(([developer, rows]) => ({ developer, rows, totals: sumGroup(rows) }));
  }, [filtered, groupByDeveloper]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project name or address..."
          className="input sm:w-72"
        />
        <div className="inline-flex rounded-lg border border-border text-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 ${
              statusFilter === "active" ? "bg-primary text-background" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 border-l border-border ${
              statusFilter === "all" ? "bg-primary text-background" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            All
          </button>
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={groupByDeveloper}
            onChange={(e) => setGroupByDeveloper(e.target.checked)}
            className="rounded border-border"
          />
          Group by developer
        </label>
      </div>

      {/* Mobile: one card per project — avoids horizontal scrolling through 6 columns */}
      <div className="sm:hidden space-y-4">
        {groups.map((group, i) => (
          <div key={group.developer ?? "all"} className={i > 0 ? "pt-6 mt-2 border-t-2 border-divider-strong" : undefined}>
            {group.developer && (
              <p className="text-sm font-semibold text-foreground mb-2">
                {group.developer !== UNASSIGNED_GROUP ? (
                  <button
                    type="button"
                    onClick={() => setSearch(group.developer!)}
                    className="hover:underline"
                    title={`Show only ${group.developer}`}
                  >
                    {group.developer}
                  </button>
                ) : (
                  group.developer
                )}
                <span className="text-muted-foreground font-normal"> · {group.rows.length} project{group.rows.length === 1 ? "" : "s"}</span>
              </p>
            )}
            <div className="space-y-3">
              {group.rows.map((r) => (
                <MobileProjectCard key={r.project.id} r={r} showStatus={showStatusColumn} />
              ))}
            </div>
            {group.developer && group.rows.length > 1 && (
              <div className="rounded-xl border border-border bg-card border-t-2 p-4 mt-3">
                <p className="text-xs font-semibold text-foreground mb-2">
                  {group.developer} total ({group.rows.length})
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Currently Invoiced</p>
                    <p
                      className={`font-semibold tabular-nums ${
                        group.totals.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
                      }`}
                    >
                      {formatCurrency(group.totals.totalOpenToOwner)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paid to Date</p>
                    <p className="font-semibold tabular-nums text-paid">
                      {formatCurrency(group.totals.totalPaidToOwner)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contract Value</p>
                    <p className="tabular-nums">{formatCurrency(group.totals.totalBudget)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Balance to Complete</p>
                    <p className="tabular-nums">{formatCurrency(group.totals.balanceToComplete)}</p>
                    <RetainageLine amount={group.totals.totalDrawRetainage} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
            No {statusFilter === "active" && !search.trim() ? "active " : ""}projects found.
          </div>
        )}
      </div>

      {/* Desktop/tablet: full table. overflow-auto (not just overflow-x) is
          deliberate — CSS computes overflow-y to "auto" the moment
          overflow-x isn't "visible" regardless, which silently makes this
          div (not the window) the positioning context for the sticky
          header below; without a bounded height here, that context never
          actually scrolls, so the header doesn't stick. Bounding it makes
          this one div the real scroll region for the table, for both axes. */}
      <div className="hidden sm:block overflow-auto max-h-[75vh] rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky top-0 left-0 z-30 bg-muted border-b border-border">
                Project
              </th>
              <th className="text-right px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                Currently Invoiced
              </th>
              <th className="text-right px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                Paid to Date
              </th>
              <th className="text-right px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                Contract Value
              </th>
              <th className="text-right px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                Balance to Complete
              </th>
              <th className="text-left px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                Next Draw
              </th>
              {showStatusColumn && (
                <th className="text-left px-4 py-2 sticky top-0 z-20 bg-muted border-b border-border">
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group, i) => (
              <Fragment key={group.developer ?? "all"}>
                {group.developer && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className={`px-4 pb-1.5 text-sm font-semibold text-foreground bg-card ${
                        i > 0 ? "pt-6 border-t-2 border-divider-strong" : "pt-4"
                      }`}
                    >
                      {group.developer !== UNASSIGNED_GROUP ? (
                        <button
                          type="button"
                          onClick={() => setSearch(group.developer!)}
                          className="hover:underline"
                          title={`Show only ${group.developer}`}
                        >
                          {group.developer}
                        </button>
                      ) : (
                        group.developer
                      )}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {group.rows.length} project{group.rows.length === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                )}
                {group.rows.map((r) => (
                  <DesktopProjectRow key={r.project.id} r={r} showStatus={showStatusColumn} />
                ))}
                {group.developer && group.rows.length > 1 && (
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-4 py-2 sticky left-0 z-10 bg-card text-foreground">
                      {group.developer} total ({group.rows.length})
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        group.totals.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
                      }`}
                    >
                      {formatCurrency(group.totals.totalOpenToOwner)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-paid">
                      {formatCurrency(group.totals.totalPaidToOwner)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">
                      {formatCurrency(group.totals.totalBudget)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="text-foreground tabular-nums">
                        {formatCurrency(group.totals.balanceToComplete)}
                      </div>
                      <RetainageLine amount={group.totals.totalDrawRetainage} className="font-normal" />
                    </td>
                    <td className="px-4 py-2" />
                    {showStatusColumn && <td className="px-4 py-2" />}
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-6 text-center text-muted-foreground">
                  No {statusFilter === "active" && !search.trim() ? "active " : ""}projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RetainageLine({ amount, className = "" }: { amount: number; className?: string }) {
  if (amount === 0) return null;
  return (
    <p
      className={`text-xs text-muted-foreground tabular-nums ${className}`}
      title={`Retainage: ${formatCurrency(amount)}`}
    >
      Retainage {formatCurrencyRounded(amount)}
    </p>
  );
}

function NextDrawLines({ r }: { r: ProjectRollup }) {
  if (r.isDrawOverdue) {
    return (
      <>
        <p className="text-muted-foreground">{r.nextDrawLabel}</p>
        <p className="font-semibold text-red-600 dark:text-red-400">
          {r.drawOverdueDays} day{r.drawOverdueDays === 1 ? "" : "s"} overdue
        </p>
      </>
    );
  }
  if (r.drawCycleSatisfiedLabel) {
    return <p className="text-muted-foreground">{r.drawCycleSatisfiedLabel}</p>;
  }
  return (
    <p className={r.isDrawUrgent ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
      {r.nextDrawLabel ?? "—"}
    </p>
  );
}

function ProjectIdentity({ r }: { r: ProjectRollup }) {
  const secondaryAddress = dashboardAddressLine(r.project.name, r.project.address);
  return (
    <>
      <span className="text-[15px] sm:text-base font-medium text-foreground hover:underline">
        {r.project.name}
      </span>
      {secondaryAddress && (
        <div className="text-xs text-muted-foreground truncate">{secondaryAddress}</div>
      )}
      {r.totalDraft > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-300">
          Draft {formatCurrency(r.totalDraft)}
        </div>
      )}
    </>
  );
}

function MobileProjectCard({ r, showStatus }: { r: ProjectRollup; showStatus: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/projects/${r.project.id}`} className="min-w-0">
          <ProjectIdentity r={r} />
        </Link>
        {showStatus && (
          <div className="shrink-0">
            <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Currently Invoiced</p>
          <p
            className={`font-semibold tabular-nums ${
              r.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
            }`}
          >
            {formatCurrency(r.totalOpenToOwner)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid to Date</p>
          <p className="font-semibold tabular-nums text-paid">{formatCurrency(r.totalPaidToOwner)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Contract Value</p>
          <p className="tabular-nums">{formatCurrency(r.totalBudget)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Balance to Complete</p>
          <p className="tabular-nums">{formatCurrency(r.balanceToComplete)}</p>
          <RetainageLine amount={r.totalDrawRetainage} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next Draw</p>
          <NextDrawLines r={r} />
        </div>
      </div>
    </div>
  );
}

function DesktopProjectRow({ r, showStatus }: { r: ProjectRollup; showStatus: boolean }) {
  return (
    <tr className="group hover:bg-muted">
      <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
        <Link href={`/projects/${r.project.id}`} className="block -mx-4 -my-2 px-4 py-2">
          <ProjectIdentity r={r} />
        </Link>
      </td>
      <td
        className={`px-4 py-2 text-right font-semibold tabular-nums ${
          r.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
        }`}
      >
        {formatCurrency(r.totalOpenToOwner)}
      </td>
      <td className="px-4 py-2 text-right font-semibold tabular-nums text-paid">
        {formatCurrency(r.totalPaidToOwner)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-foreground">{formatCurrency(r.totalBudget)}</td>
      <td className="px-4 py-2 text-right">
        <div className="text-foreground tabular-nums">{formatCurrency(r.balanceToComplete)}</div>
        <RetainageLine amount={r.totalDrawRetainage} />
      </td>
      <td className="px-4 py-2 whitespace-nowrap">
        <NextDrawLines r={r} />
      </td>
      {showStatus && (
        <td className="px-4 py-2">
          <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
        </td>
      )}
    </tr>
  );
}
