"use client";

import { useMemo, useState, useTransition } from "react";
import { SubInvoice, SubInvoiceStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import { deleteSubInvoice, upsertSubInvoice } from "@/app/invoices/actions";

const STATUSES: SubInvoiceStatus[] = ["received", "approved", "paid", "disputed"];

export default function SubInvoicesSection({
  projectId,
  invoices,
}: {
  projectId: string;
  invoices: SubInvoice[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubInvoice | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        inv.subcontractor_name.toLowerCase().includes(q) ||
        (inv.trade ?? "").toLowerCase().includes(q) ||
        (inv.invoice_number ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, statusFilter]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(inv: SubInvoice) {
    setEditing(inv);
    setModalOpen(true);
  }

  function handleDelete(inv: SubInvoice) {
    if (!confirm(`Delete invoice from ${inv.subcontractor_name}?`)) return;
    startTransition(() => {
      deleteSubInvoice(inv.id, projectId);
    });
  }

  async function handleSubmit(formData: FormData) {
    await upsertSubInvoice(formData);
    setModalOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subcontractor, trade, invoice #..."
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-64"
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
          + Add Invoice
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Subcontractor</th>
              <th className="text-left px-4 py-2">Trade</th>
              <th className="text-left px-4 py-2">Invoice #</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-right px-4 py-2">Retainage</th>
              <th className="text-right px-4 py-2">Paid</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{inv.subcontractor_name}</td>
                <td className="px-4 py-2 text-slate-500">{inv.trade ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{inv.invoice_number ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(inv.invoice_date)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(inv.amount)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(inv.retainage_held)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(inv.amount_paid)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => openEdit(inv)}
                    className="text-slate-500 hover:text-slate-900 text-xs font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(inv)}
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
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Invoice — ${editing.subcontractor_name}` : "Add Sub Invoice"}
      >
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Subcontractor">
              <input
                name="subcontractor_name"
                required
                defaultValue={editing?.subcontractor_name ?? ""}
                className="input"
              />
            </Field>
            <Field label="Trade">
              <input name="trade" defaultValue={editing?.trade ?? ""} className="input" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice #">
              <input
                name="invoice_number"
                defaultValue={editing?.invoice_number ?? ""}
                className="input"
              />
            </Field>
            <Field label="Invoice date">
              <input
                name="invoice_date"
                type="date"
                defaultValue={editing?.invoice_date ?? ""}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input
                name="amount"
                type="number"
                step="0.01"
                defaultValue={editing?.amount ?? 0}
                className="input"
              />
            </Field>
            <Field label="Retainage held">
              <input
                name="retainage_held"
                type="number"
                step="0.01"
                defaultValue={editing?.retainage_held ?? 0}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount paid">
              <input
                name="amount_paid"
                type="number"
                step="0.01"
                defaultValue={editing?.amount_paid ?? 0}
                className="input"
              />
            </Field>
            <Field label="Date paid">
              <input
                name="date_paid"
                type="date"
                defaultValue={editing?.date_paid ?? ""}
                className="input"
              />
            </Field>
          </div>

          <Field label="Status">
            <select name="status" defaultValue={editing?.status ?? "received"} className="input">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

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
