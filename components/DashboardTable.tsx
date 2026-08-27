"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProjectRollup } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
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
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full sm:w-72"
        />
        <div className="inline-flex rounded-lg border border-slate-300 text-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 ${
              statusFilter === "active" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 border-l border-slate-300 ${
              statusFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            All
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-slate-50">Project</th>
              <th className="text-right px-4 py-2">Currently Invoiced</th>
              <th className="text-right px-4 py-2">Paid to Date</th>
              <th className="text-right px-4 py-2">Contract Value</th>
              <th className="text-right px-4 py-2">Balance to Complete</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.project.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 sticky left-0 z-10 bg-white">
                  <Link
                    href={`/projects/${r.project.id}`}
                    className="block -mx-4 -my-2 px-4 py-2"
                  >
                    <span className="font-medium text-slate-900 hover:underline">
                      {r.project.name}
                    </span>
                    {r.project.address && (
                      <div className="text-xs text-slate-400">{r.project.address}</div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-medium text-invoiced">
                  {formatCurrency(r.totalOpenToOwner)}
                </td>
                <td className="px-4 py-2 text-right font-medium text-emerald-700">
                  {formatCurrency(r.totalPaidToOwner)}
                </td>
                <td className="px-4 py-2 text-right text-slate-900">
                  {formatCurrency(r.totalBudget)}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="text-slate-900">{formatCurrency(r.balanceToComplete)}</div>
                  <div className="text-xs text-slate-400">
                    +{formatCurrency(r.totalDrawRetainage)} retainage
                  </div>
                </td>
                <td className="px-4 py-2">
                  <ProjectStatusSelect projectId={r.project.id} status={r.project.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
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
