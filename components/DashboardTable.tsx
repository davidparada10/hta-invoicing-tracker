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
        r.project.project_number.toLowerCase().includes(q) ||
        (r.project.address ?? "").toLowerCase().includes(q)
    );
  }, [rollups, search]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by project name, number, or address..."
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-72 mb-4"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Project</th>
              <th className="text-right px-4 py-2">Draws Requested</th>
              <th className="text-right px-4 py-2">Draws Approved</th>
              <th className="text-right px-4 py-2">Sub Invoiced</th>
              <th className="text-right px-4 py-2">Sub Paid</th>
              <th className="text-right px-4 py-2">Sub Outstanding</th>
              <th className="text-right px-4 py-2">Retainage Held</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.project.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/projects/${r.project.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {r.project.name}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {r.project.project_number}
                    {r.project.address ? ` · ${r.project.address}` : ""}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.totalRequested)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.totalApproved)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.totalSubInvoiced)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.totalSubPaid)}</td>
                <td className="px-4 py-2 text-right font-medium">
                  {formatCurrency(r.totalSubOutstanding)}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatCurrency(r.totalDrawRetainage + r.totalSubRetainage)}
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
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
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
