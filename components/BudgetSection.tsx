"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { BudgetLine, DrawLineAllocation } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Modal from "@/components/Modal";
import { deleteBudgetLine, importBudgetFromXlsx, upsertBudgetLine } from "@/app/budget/actions";

export default function BudgetSection({
  projectId,
  budgetLines,
  allocations,
}: {
  projectId: string;
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
}) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [isPending, startTransition] = useTransition();

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalBudget = useMemo(
    () => budgetLines.reduce((acc, l) => acc + (l.scheduled_value ?? 0), 0),
    [budgetLines]
  );

  const drawnByLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations) {
      totals.set(a.budget_line_id, (totals.get(a.budget_line_id) ?? 0) + a.amount);
    }
    return totals;
  }, [allocations]);

  const totalDrawn = useMemo(
    () => Array.from(drawnByLine.values()).reduce((acc, v) => acc + v, 0),
    [drawnByLine]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return budgetLines;
    return budgetLines.filter(
      (l) =>
        l.description.toLowerCase().includes(q) ||
        (l.category ?? "").toLowerCase().includes(q) ||
        (l.item_number ?? "").toLowerCase().includes(q)
    );
  }, [budgetLines, search]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(line: BudgetLine) {
    setEditing(line);
    setModalOpen(true);
  }

  function handleDelete(line: BudgetLine) {
    if (!confirm(`Delete budget line "${line.description}"?`)) return;
    startTransition(() => {
      deleteBudgetLine(line.id, projectId);
    });
  }

  async function handleSubmit(formData: FormData) {
    await upsertBudgetLine(formData);
    setModalOpen(false);
  }

  async function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      budgetLines.length > 0 &&
      !confirm(
        `This project already has ${budgetLines.length} budget line(s). Importing will replace all of them with the line items from this file. Continue?`
      )
    ) {
      e.target.value = "";
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const fd = new FormData();
      fd.set("budget_file", file);
      fd.set("project_id", projectId);
      const result = await importBudgetFromXlsx(fd);
      setImportMessage(
        `Imported ${result.count} line items totaling ${formatCurrency(result.total)}.`
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Total Budget (Scheduled Value)
          </p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">
            {formatCurrency(totalBudget)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Drawn to Date
          </p>
          <p className="text-2xl font-semibold text-blue-700 mt-1">
            {formatCurrency(totalDrawn)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Balance to Finish
          </p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">
            {formatCurrency(totalBudget - totalDrawn)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item, category, or description..."
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-72"
        />
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleImportFile}
            disabled={importing}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import from G702/G703"}
          </button>
          <button
            onClick={openAdd}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-1.5"
          >
            + Add Line
          </button>
        </div>
      </div>

      {importError && <p className="text-sm text-red-600 mb-3">{importError}</p>}
      {importMessage && !importError && (
        <p className="text-sm text-emerald-600 mb-3">{importMessage}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-slate-50">Item #</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-right px-4 py-2">Scheduled Value</th>
              <th className="text-right px-4 py-2">Drawn to Date</th>
              <th className="text-right px-4 py-2">Balance to Finish</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((l) => {
              const drawn = drawnByLine.get(l.id) ?? 0;
              return (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500 sticky left-0 z-10 bg-white">
                  {l.item_number ?? "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">{l.category ?? "—"}</td>
                <td className="px-4 py-2 font-medium">
                  {l.description}
                  {l.retention_exempt && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                      No retention
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{formatCurrency(l.scheduled_value)}</td>
                <td className="px-4 py-2 text-right text-blue-700">{formatCurrency(drawn)}</td>
                <td className="px-4 py-2 text-right text-slate-500">
                  {formatCurrency(l.scheduled_value - drawn)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => openEdit(l)}
                    className="text-slate-500 hover:text-slate-900 text-xs font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(l)}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No budget line items yet. Add one manually or import from a G702/G703 workbook.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Budget Line" : "Add Budget Line"}
      >
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Item #">
              <input
                name="item_number"
                defaultValue={editing?.item_number ?? ""}
                className="input"
              />
            </Field>
            <Field label="Category">
              <input name="category" defaultValue={editing?.category ?? ""} className="input" />
            </Field>
          </div>

          <Field label="Description">
            <input
              name="description"
              required
              defaultValue={editing?.description ?? ""}
              className="input"
            />
          </Field>

          <Field label="Scheduled value">
            <input
              name="scheduled_value"
              type="number"
              step="0.01"
              defaultValue={editing?.scheduled_value ?? 0}
              className="input"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="retention_exempt"
              defaultChecked={editing?.retention_exempt ?? false}
              className="rounded border-slate-300"
            />
            No retention held on this line (e.g. bonds, insurance, GC fee)
          </label>

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
