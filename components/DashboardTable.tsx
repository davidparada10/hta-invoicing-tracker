"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProjectRollup } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { drawDueLabel } from "@/lib/drawSchedule";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";

export default function DashboardTable({ rollups }: { rollups: ProjectRollup[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rollups.filter((r) => {
      if (statusFilter === "active" && r.project.status !== "active") return false;
      if (!q) return true;
      return (
        r.project.name.toLowerCase().includes(q) ||
        (r.project.address ?? "").toLowerCase().includes(q)
      );
    });
  }, [rollups, search, statusFilter]);

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
      </div>

      {/* Mobile: one card per project — avoids horizontal scrolling through 6 columns */}
      <div className="sm:hidden space-y-3">
        {filtered.map((r) => (
          <div key={r.project.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/projects/${r.project.id}`} className="min-w-0">
                <span className="font-medium text-foreground hover:underline">
                  {r.project.name}
                </span>
                {r.project.address && (
                  <div className="text-xs text-muted-foreground truncate">{r.project.address}</div>
                )}
              </Link>
              <div className="shrink-0">
                <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Currently Invoiced</p>
                <p className="font-medium text-invoiced">{formatCurrency(r.totalOpenToOwner)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid to Date</p>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(r.totalPaidToOwner)}
                </p>
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
                <p className="text-xs text-muted-foreground">Draft</p>
                <p
                  className={
                    r.totalDraft > 0
                      ? "font-medium text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
                  }
                >
                  {r.totalDraft > 0 ? formatCurrency(r.totalDraft) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Draw</p>
                <p
                  className={
                    r.isDrawUrgent
                      ? "font-bold text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }
                >
                  {drawDueLabel(r.project) ?? "—"}
                  {r.isDrawOverdue && " · Overdue"}
                </p>
              </div>
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
              <th className="text-right px-4 py-2">Draft</th>
              <th className="text-left px-4 py-2">Next Draw</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.project.id} className="group hover:bg-muted">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
                  <Link
                    href={`/projects/${r.project.id}`}
                    className="block -mx-4 -my-2 px-4 py-2"
                  >
                    <span className="font-medium text-foreground hover:underline">
                      {r.project.name}
                    </span>
                    {r.project.address && (
                      <div className="text-xs text-muted-foreground">{r.project.address}</div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-medium text-invoiced">
                  {formatCurrency(r.totalOpenToOwner)}
                </td>
                <td className="px-4 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(r.totalPaidToOwner)}
                </td>
                <td className="px-4 py-2 text-right text-foreground">
                  {formatCurrency(r.totalBudget)}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="text-foreground">{formatCurrency(r.balanceToComplete)}</div>
                  <div className="text-xs text-muted-foreground">
                    +{formatCurrency(r.totalDrawRetainage)} retainage
                  </div>
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    r.totalDraft > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
                  }`}
                >
                  {r.totalDraft > 0 ? formatCurrency(r.totalDraft) : "—"}
                </td>
                <td
                  className={`px-4 py-2 whitespace-nowrap ${
                    r.isDrawUrgent ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground"
                  }`}
                >
                  {drawDueLabel(r.project) ?? "—"}
                  {r.isDrawOverdue && " · Overdue"}
                </td>
                <td className="px-4 py-2">
                  <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
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
