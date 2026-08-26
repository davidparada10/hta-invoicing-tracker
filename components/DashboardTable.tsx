"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProjectRollup } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

export default function DashboardTable({ rollups }: { rollups: ProjectRollup[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rollups;
    return rollups.filter(
      (r) =>
        r.project.name.toLowerCase().includes(q) ||
        (r.project.address ?? "").toLowerCase().includes(q)
    );
  }, [rollups, search]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by project name or address..."
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-72 mb-4"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Project</th>
              <th className="text-right px-4 py-2">Currently Invoiced</th>
              <th className="text-right px-4 py-2">Paid to Date</th>
              <th className="text-right px-4 py-2">Project Budget</th>
              <th className="text-right px-4 py-2">Balance to Complete + Retainage</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.project.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
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
                <td className="px-4 py-2 text-right font-medium text-blue-700">
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
                    +{formatCurrency(r.totalDrawRetainage + r.totalSubRetainage)} retainage
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      r.project.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {r.project.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
