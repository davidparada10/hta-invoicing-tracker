"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ProjectRollup } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";

// No-developer-set projects sort after every named group, but still need a
// stable, distinct key from an actual (possibly falsy-looking) developer
// name — an empty string, not null/undefined, so it sorts predictably.
const UNASSIGNED_GROUP = "Unassigned";

export default function DashboardTable({ rollups }: { rollups: ProjectRollup[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [groupByDeveloper, setGroupByDeveloper] = useState(true);

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
      .map(([developer, rows]) => ({ developer, rows }));
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
        {groups.map((group) => (
          <div key={group.developer ?? "all"}>
            {group.developer && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {group.developer}
              </p>
            )}
            <div className="space-y-3">
              {group.rows.map((r) => (
                <MobileProjectCard key={r.project.id} r={r} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
            No {statusFilter === "active" && !search.trim() ? "active " : ""}projects found.
          </div>
        )}
      </div>

      {/* Desktop/tablet: full table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Project</th>
              <th className="text-right px-4 py-2">Currently Invoiced</th>
              <th className="text-right px-4 py-2">Paid to Date</th>
              <th className="text-right px-4 py-2">Contract Value</th>
              <th className="text-right px-4 py-2">Balance to Complete</th>
              <th className="text-left px-4 py-2">Next Draw</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => (
              <Fragment key={group.developer ?? "all"}>
                {group.developer && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-card"
                    >
                      {group.developer}
                    </td>
                  </tr>
                )}
                {group.rows.map((r) => (
                  <DesktopProjectRow key={r.project.id} r={r} />
                ))}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
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

function MobileProjectCard({ r }: { r: ProjectRollup }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/projects/${r.project.id}`} className="min-w-0">
          <span className="font-medium text-foreground hover:underline">{r.project.name}</span>
          {(r.project.address || r.totalDraft > 0) && (
            <div className="text-xs text-muted-foreground truncate">
              {r.project.address}
              {r.project.address && r.totalDraft > 0 && " · "}
              {r.totalDraft > 0 && (
                <span className="text-amber-700 dark:text-amber-300">
                  {formatCurrency(r.totalDraft)} draft
                </span>
              )}
            </div>
          )}
        </Link>
        <div className="shrink-0">
          <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Currently Invoiced</p>
          <p
            className={`font-medium ${
              r.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
            }`}
          >
            {formatCurrency(r.totalOpenToOwner)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid to Date</p>
          <p className="font-medium text-paid">{formatCurrency(r.totalPaidToOwner)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Contract Value</p>
          <p>{formatCurrency(r.totalBudget)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Balance to Complete</p>
          <p>{formatCurrency(r.balanceToComplete)}</p>
          <p className="text-xs text-muted-foreground">
            +{formatCurrency(r.totalDrawRetainage)} retainage
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next Draw</p>
          <p
            className={
              r.isDrawUrgent ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground"
            }
          >
            {r.nextDrawLabel ?? "—"}
            {r.isDrawOverdue && " · Overdue"}
          </p>
        </div>
      </div>
    </div>
  );
}

function DesktopProjectRow({ r }: { r: ProjectRollup }) {
  return (
    <tr className="group hover:bg-muted">
      <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
        <Link href={`/projects/${r.project.id}`} className="block -mx-4 -my-2 px-4 py-2">
          <span className="font-medium text-foreground hover:underline">{r.project.name}</span>
          {(r.project.address || r.totalDraft > 0) && (
            <div className="text-xs text-muted-foreground">
              {r.project.address}
              {r.project.address && r.totalDraft > 0 && " · "}
              {r.totalDraft > 0 && (
                <span className="text-amber-700 dark:text-amber-300">
                  {formatCurrency(r.totalDraft)} draft
                </span>
              )}
            </div>
          )}
        </Link>
      </td>
      <td
        className={`px-4 py-2 text-right font-medium ${
          r.hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"
        }`}
      >
        {formatCurrency(r.totalOpenToOwner)}
      </td>
      <td className="px-4 py-2 text-right font-medium text-paid">
        {formatCurrency(r.totalPaidToOwner)}
      </td>
      <td className="px-4 py-2 text-right text-foreground">{formatCurrency(r.totalBudget)}</td>
      <td className="px-4 py-2 text-right">
        <div className="text-foreground">{formatCurrency(r.balanceToComplete)}</div>
        <div className="text-xs text-muted-foreground">
          +{formatCurrency(r.totalDrawRetainage)} retainage
        </div>
      </td>
      <td
        className={`px-4 py-2 whitespace-nowrap ${
          r.isDrawUrgent ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground"
        }`}
      >
        {r.nextDrawLabel ?? "—"}
        {r.isDrawOverdue && " · Overdue"}
      </td>
      <td className="px-4 py-2">
        <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
      </td>
    </tr>
  );
}
