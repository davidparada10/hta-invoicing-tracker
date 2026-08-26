"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerDraw, DrawStatus, BudgetLine, DrawLineAllocation } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Modal from "@/components/Modal";
import { parseG702Upload, upsertDraw } from "@/app/draws/actions";

const STATUSES: DrawStatus[] = ["draft", "submitted", "approved", "paid"];

interface DrawFormValues {
  draw_number: string;
  status: DrawStatus;
  period_start: string;
  period_end: string;
  amount_requested: string;
  amount_approved: string;
  retainage_held: string;
  amount_paid: string;
  date_submitted: string;
  date_approved: string;
  date_paid: string;
  notes: string;
}

const EMPTY_FORM: DrawFormValues = {
  draw_number: "",
  status: "draft",
  period_start: "",
  period_end: "",
  amount_requested: "0",
  amount_approved: "0",
  retainage_held: "0",
  amount_paid: "0",
  date_submitted: "",
  date_approved: "",
  date_paid: "",
  notes: "",
};

function drawToForm(d: OwnerDraw | null): DrawFormValues {
  if (!d) return EMPTY_FORM;
  return {
    draw_number: String(d.draw_number),
    status: d.status,
    period_start: d.period_start ?? "",
    period_end: d.period_end ?? "",
    amount_requested: String(d.amount_requested),
    amount_approved: String(d.amount_approved),
    retainage_held: String(d.retainage_held),
    amount_paid: String(d.amount_paid),
    date_submitted: d.date_submitted ?? "",
    date_approved: d.date_approved ?? "",
    date_paid: d.date_paid ?? "",
    notes: d.notes ?? "",
  };
}

function allocationsForDraw(
  allocations: DrawLineAllocation[],
  drawId: string | undefined
): Record<string, string> {
  const amounts: Record<string, string> = {};
  if (!drawId) return amounts;
  for (const a of allocations) {
    if (a.draw_id === drawId) amounts[a.budget_line_id] = String(a.amount);
  }
  return amounts;
}

export default function DrawFormModal({
  open,
  onClose,
  projectId,
  editing,
  budgetLines,
  allocations,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editing: OwnerDraw | null;
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
}) {
  const [formValues, setFormValues] = useState<DrawFormValues>(EMPTY_FORM);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedFileName, setParsedFileName] = useState<string | null>(null);
  const [parsedAllocationsCount, setParsedAllocationsCount] = useState<number | null>(null);
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [retentionMode, setRetentionMode] = useState<"manual" | "0" | "5" | "10">("manual");

  useEffect(() => {
    if (!open) return;
    setFormValues(drawToForm(editing));
    setLineAmounts(allocationsForDraw(allocations, editing?.id));
    setRetentionMode("manual");
    setParsing(false);
    setParseError(null);
    setParsedFileName(null);
    setParsedAllocationsCount(null);
  }, [open, editing, allocations]);

  const previousByLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations) {
      if (editing && a.draw_id === editing.id) continue;
      totals.set(a.budget_line_id, (totals.get(a.budget_line_id) ?? 0) + a.amount);
    }
    return totals;
  }, [allocations, editing]);

  const allocationsTotal = useMemo(
    () => Object.values(lineAmounts).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [lineAmounts]
  );

  const computedRetention = useMemo(() => {
    if (retentionMode === "manual") return null;
    const rate = Number(retentionMode) / 100;
    const total = budgetLines.reduce((acc, line) => {
      if (line.retention_exempt) return acc;
      return acc + (Number(lineAmounts[line.id]) || 0) * rate;
    }, 0);
    return Math.round(total * 100) / 100;
  }, [retentionMode, budgetLines, lineAmounts]);

  useEffect(() => {
    if (computedRetention === null) return;
    setFormValues((v) => ({ ...v, retainage_held: String(computedRetention) }));
  }, [computedRetention]);

  async function handleSubmit(formData: FormData) {
    const allocationsPayload = budgetLines
      .map((line) => ({
        budget_line_id: line.id,
        amount: Number(lineAmounts[line.id]) || 0,
      }))
      .filter((a) => a.amount !== 0);
    formData.set("allocations", JSON.stringify(allocationsPayload));
    await upsertDraw(formData);
    onClose();
  }

  function updateField<K extends keyof DrawFormValues>(key: K, value: DrawFormValues[K]) {
    setFormValues((v) => ({ ...v, [key]: value }));
  }

  function updateStatus(status: DrawStatus) {
    setFormValues((v) => {
      if (status !== "paid" || (Number(v.amount_paid) || 0) > 0) {
        return { ...v, status };
      }
      return {
        ...v,
        status,
        amount_paid: v.amount_requested,
        date_paid: v.date_paid || new Date().toISOString().slice(0, 10),
      };
    });
  }

  function updateLineAmount(budgetLineId: string, value: string) {
    setLineAmounts((v) => ({ ...v, [budgetLineId]: value }));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setParseError(null);
    setParsedFileName(null);
    setParsedAllocationsCount(null);

    try {
      const fd = new FormData();
      fd.set("g702_file", file);
      fd.set("project_id", projectId);
      const parsed = await parseG702Upload(fd);

      setFormValues((v) => ({
        ...v,
        draw_number: parsed.draw_number !== undefined ? String(parsed.draw_number) : v.draw_number,
        period_end: parsed.period_end ?? v.period_end,
        date_submitted: parsed.date_submitted ?? v.date_submitted,
        amount_requested:
          parsed.amount_requested !== undefined ? String(parsed.amount_requested) : v.amount_requested,
        retainage_held:
          parsed.retainage_held !== undefined ? String(parsed.retainage_held) : v.retainage_held,
        status: v.status === "draft" ? "submitted" : v.status,
      }));

      if (parsed.allocations.length > 0) {
        setLineAmounts((prev) => {
          const next = { ...prev };
          for (const a of parsed.allocations) {
            next[a.budget_line_id] = String(a.amount);
          }
          return next;
        });
        setParsedAllocationsCount(parsed.allocationsMatched);
      }

      setParsedFileName(file.name);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit Draw #${editing.draw_number}` : "Add Draw"}
      size="xl"
    >
      <form action={handleSubmit} className="space-y-3">
        <input type="hidden" name="project_id" value={projectId} />
        {editing && <input type="hidden" name="id" value={editing.id} />}

        <div className="rounded-lg border border-dashed border-slate-300 p-3 bg-slate-50">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {editing
              ? "Re-upload a G702 (.xlsx or .pdf) to refresh this draw's numbers"
              : "Upload G702 (.xlsx or .pdf) to auto-fill this form"}
          </label>
          {editing && (
            <p className="text-xs text-slate-500 mb-2">
              Useful if the lender rejected this draw or the amounts changed — this replaces
              the requested amount, retainage, and dates below with the new file&rsquo;s numbers.
            </p>
          )}
          <input
            type="file"
            accept=".xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
            onChange={handleFileUpload}
            disabled={parsing}
            className="text-sm w-full"
          />
          {parsing && <p className="text-xs text-slate-500 mt-1">Reading file…</p>}
          {parseError && <p className="text-xs text-red-600 mt-1">{parseError}</p>}
          {parsedFileName && !parsing && !parseError && (
            <p className="text-xs text-emerald-600 mt-1">
              Auto-filled from {parsedFileName}.
              {parsedAllocationsCount
                ? ` Also filled in ${parsedAllocationsCount} schedule-of-values line${
                    parsedAllocationsCount === 1 ? "" : "s"
                  } from the G703 sheet.`
                : ""}{" "}
              Review the fields below before saving.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Draw #">
            <input
              name="draw_number"
              type="number"
              required
              value={formValues.draw_number}
              onChange={(e) => updateField("draw_number", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Status">
            <select
              name="status"
              value={formValues.status}
              onChange={(e) => updateStatus(e.target.value as DrawStatus)}
              className="input"
            >
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
              value={formValues.period_start}
              onChange={(e) => updateField("period_start", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Period end">
            <input
              name="period_end"
              type="date"
              value={formValues.period_end}
              onChange={(e) => updateField("period_end", e.target.value)}
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
              value={formValues.amount_requested}
              onChange={(e) => updateField("amount_requested", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Amount approved">
            <input
              name="amount_approved"
              type="number"
              step="0.01"
              value={formValues.amount_approved}
              onChange={(e) => updateField("amount_approved", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Retainage held">
            <input
              name="retainage_held"
              type="number"
              step="0.01"
              value={formValues.retainage_held}
              onChange={(e) => updateField("retainage_held", e.target.value)}
              readOnly={retentionMode !== "manual"}
              className={`input ${retentionMode !== "manual" ? "bg-slate-50 text-slate-500" : ""}`}
            />
            {retentionMode !== "manual" && (
              <p className="text-[11px] text-slate-400 mt-1">
                Computed from {retentionMode}% retention on the schedule of values below.
              </p>
            )}
          </Field>
          <Field label="Amount paid">
            <input
              name="amount_paid"
              type="number"
              step="0.01"
              value={formValues.amount_paid}
              onChange={(e) => updateField("amount_paid", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Date submitted">
            <input
              name="date_submitted"
              type="date"
              value={formValues.date_submitted}
              onChange={(e) => updateField("date_submitted", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Date approved">
            <input
              name="date_approved"
              type="date"
              value={formValues.date_approved}
              onChange={(e) => updateField("date_approved", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Date paid">
            <input
              name="date_paid"
              type="date"
              value={formValues.date_paid}
              onChange={(e) => updateField("date_paid", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {budgetLines.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="block text-xs font-medium text-slate-600">
                Schedule of values — amount billed this period, by budget line
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Retention
                  <select
                    value={retentionMode}
                    onChange={(e) => setRetentionMode(e.target.value as typeof retentionMode)}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                  >
                    <option value="manual">Manual</option>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                  </select>
                </label>
                <span className="text-xs text-slate-500">
                  {formatCurrency(allocationsTotal)} allocated
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Lines marked &ldquo;No retention&rdquo; in the Budget tab are excluded from the calculation.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-100">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">Budget line</th>
                    <th className="text-right px-2 py-1.5">Scheduled</th>
                    <th className="text-right px-2 py-1.5">Previous</th>
                    <th className="text-right px-2 py-1.5 w-28">This draw</th>
                    <th className="text-right px-2 py-1.5">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budgetLines.map((line) => {
                    const previous = previousByLine.get(line.id) ?? 0;
                    const thisDraw = Number(lineAmounts[line.id]) || 0;
                    const balance = line.scheduled_value - previous - thisDraw;
                    return (
                      <tr key={line.id}>
                        <td className="px-2 py-1.5 text-slate-700 min-w-[14rem]">
                          {line.item_number ? `${line.item_number} — ` : ""}
                          {line.description}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-500 whitespace-nowrap">
                          {formatCurrency(line.scheduled_value)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-500 whitespace-nowrap">
                          {formatCurrency(previous)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={lineAmounts[line.id] ?? ""}
                            onChange={(e) => updateLineAmount(line.id, e.target.value)}
                            placeholder="0"
                            className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-500 whitespace-nowrap">
                          {formatCurrency(balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea
            name="notes"
            value={formValues.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            className="input"
            rows={2}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
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
