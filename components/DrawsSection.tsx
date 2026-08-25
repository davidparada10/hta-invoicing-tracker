"use client";

import { useMemo, useState, useTransition } from "react";
import { OwnerDraw, DrawStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import { deleteDraw, upsertDraw } from "@/app/draws/actions";

const STATUSES: DrawStatus[] = ["draft", "submitted", "approved", "paid"];

export default function DrawsSection({
  projectId,
  draws,
}: {
  projectId: string;
  draws: OwnerDraw[];
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

  async function handleSubmit(formData: FormData) {
    await upsertDraw(formData);
    setModalOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search draw # or notes..."
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
          className="ml-auto rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-1.5"
        >
          + Add Draw
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Draw #</th>
              <th className="text-left px-4 py-2">Period</th>
              <th className="text-right px-4 py-2">Requested</th>
              <th className="text-right px-4 py-2">Approved</th>
              <th className="text-right px-4 py-2">Retainage</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-left px-4 py-2">Approved</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{d.draw_number}</td>
                <td className="px-4 py-2 text-slate-500">
                  {formatDate(d.period_start)} – {formatDate(d.period_end)}
                </td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_approved)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.retainage_held)}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(d.date_submitted)}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(d.date_approved)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => openEdit(d)}
                    className="text-slate-500 hover:text-slate-900 text-xs font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  No draws found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Draw #${editing.draw_number}` : "Add Draw"}
      >
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Draw #">
              <input
                name="draw_number"
                type="number"
                required
                defaultValue={editing?.draw_number ?? ""}
                className="input"
              />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={editing?.status ?? "draft"} className="input">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start">
              <input
                name="period_start"
                type="date"
                defaultValue={editing?.period_start ?? ""}
                className="input"
              />
            </Field>
            <Field label="Period end">
              <input
                name="period_end"
                type="date"
                defaultValue={editing?.period_end ?? ""}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount requested">
              <input
                name="amount_requested"
                type="number"
                step="0.01"
                defaultValue={editing?.amount_requested ?? 0}
                className="input"
              />
            </Field>
            <Field label="Amount approved">
              <input
                name="amount_approved"
                type="number"
                step="0.01"
                defaultValue={editing?.amount_approved ?? 0}
                className="input"
              />
            </Field>
          </div>

          <Field label="Retainage held">
            <input
              name="retainage_held"
              type="number"
              step="0.01"
              defaultValue={editing?.retainage_held ?? 0}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date submitted">
              <input
                name="date_submitted"
                type="date"
                defaultValue={editing?.date_submitted ?? ""}
                className="input"
              />
            </Field>
            <Field label="Date approved">
              <input
                name="date_approved"
                type="date"
                defaultValue={editing?.date_approved ?? ""}
                className="input"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea name="notes" defaultValue={editing?.notes ?? ""} className="input" rows={2} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
