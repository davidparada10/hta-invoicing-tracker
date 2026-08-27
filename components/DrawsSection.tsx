"use client";

import { useMemo, useState, useTransition } from "react";
import { OwnerDraw, DrawStatus, BudgetLine, DrawLineAllocation } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import DrawStatusSelect from "@/components/DrawStatusSelect";
import DrawFormModal from "@/components/DrawFormModal";
import MarkPaidButton from "@/components/MarkPaidButton";
import { deleteDraw } from "@/app/draws/actions";

const STATUSES: DrawStatus[] = ["draft", "submitted", "approved", "paid"];

export default function DrawsSection({
  projectId,
  draws,
  budgetLines,
  allocations,
}: {
  projectId: string;
  draws: OwnerDraw[];
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OwnerDraw | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return draws.filter((d) => {
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesSearch =
        search.trim() === "" ||
        String(d.draw_number).includes(search.trim()) ||
        (d.notes ?? "").toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [draws, search, statusFilter]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(draw: OwnerDraw) {
    setEditing(draw);
    setModalOpen(true);
  }

  function handleDelete(draw: OwnerDraw) {
    if (!confirm(`Delete draw #${draw.draw_number}?`)) return;
    startTransition(() => {
      deleteDraw(draw.id, projectId);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search draw # or notes..."
          className="input w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={openAdd}
          className="ml-auto rounded-lg bg-primary text-background text-sm font-medium px-3 py-1.5"
        >
          + Add Draw
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Draw #</th>
              <th className="text-left px-4 py-2">Period</th>
              <th className="text-right px-4 py-2">Requested</th>
              <th className="text-right px-4 py-2">Approved</th>
              <th className="text-right px-4 py-2">Retainage</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-left px-4 py-2">Approved</th>
              <th className="text-left px-4 py-2">Paid</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((d) => (
              <tr key={d.id} className="group hover:bg-muted">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
                  <button
                    type="button"
                    onClick={() => openEdit(d)}
                    className="font-medium text-foreground hover:underline"
                    title="Edit draw"
                  >
                    {d.draw_number}
                  </button>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatDate(d.period_start)} – {formatDate(d.period_end)}
                </td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_approved)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.retainage_held)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(d.date_submitted)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(d.date_approved)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(d.date_paid)}</td>
                <td className="px-4 py-2">
                  <DrawStatusSelect drawId={d.id} projectId={projectId} status={d.status} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {(d.status === "submitted" || d.status === "approved") && (
                    <MarkPaidButton
                      drawId={d.id}
                      projectId={projectId}
                      drawNumber={d.draw_number}
                      amountRequested={d.amount_requested}
                      amountPaid={d.amount_paid}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-medium mr-3 disabled:opacity-50"
                    />
                  )}
                  <button
                    onClick={() => openEdit(d)}
                    className="text-muted-foreground hover:text-foreground text-xs font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    disabled={isPending}
                    className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                  No draws found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DrawFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        projectId={projectId}
        editing={editing}
        budgetLines={budgetLines}
        allocations={allocations}
      />
    </div>
  );
}
