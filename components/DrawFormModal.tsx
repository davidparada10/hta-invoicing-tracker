"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerDraw, DrawStatus, BudgetLine, DrawLineAllocation } from "@/lib/types";
import { businessTodayISO, formatCurrency } from "@/lib/format";
import Modal from "@/components/Modal";
import DrawPaymentsPanel from "@/components/DrawPaymentsPanel";
import { formPaymentIntent, ownerPaidFromAmounts, paidTransition } from "@/lib/paymentDefaults";
import { groupLiveReceipts, type DrawPayment } from "@/lib/paymentHistory";
import { ParsedG702Upload, parseG702Upload, upsertDraw } from "@/app/draws/actions";
import { allocationExceedsTolerance, applyParsedAllocations, LineAmounts } from "@/lib/drawAllocations";
import {
  convertCumulativeRetention,
  computeRetentionRelease,
  inferRetentionRate,
  isImplausibleRetainage,
} from "@/lib/retentionRelease";

type RetentionMode = "manual" | "0" | "5" | "10" | "release" | "document_cumulative";

const STATUSES: DrawStatus[] = ["draft", "submitted", "approved", "paid"];
const MAX_G702_UPLOAD_BYTES = 20 * 1024 * 1024; // keep in sync with app/draws/actions.ts

interface DrawFormValues {
  draw_number: string;
  status: DrawStatus;
  period_start: string;
  period_end: string;
  amount_requested: string;
  amount_approved: string;
  retainage_held: string;
  date_submitted: string;
  date_approved: string;
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
  date_submitted: "",
  date_approved: "",
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
    date_submitted: d.date_submitted ?? "",
    date_approved: d.date_approved ?? "",
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
  draws,
  budgetLines,
  allocations,
  payments = [],
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editing: OwnerDraw | null;
  draws: OwnerDraw[];
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
  payments?: DrawPayment[];
}) {
  const [formValues, setFormValues] = useState<DrawFormValues>(EMPTY_FORM);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedFileName, setParsedFileName] = useState<string | null>(null);
  const [noAllocationsInLastParse, setNoAllocationsInLastParse] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [lineAmounts, setLineAmounts] = useState<LineAmounts>({});
  const [retentionMode, setRetentionMode] = useState<RetentionMode>("manual");
  const [autoSelectedRetention, setAutoSelectedRetention] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // An upload's parsed allocations wait here for explicit review (replace
  // vs. merge, any unmatched lines) instead of silently overwriting
  // lineAmounts — see applyPendingParse/discardPendingParse below.
  const [pendingParse, setPendingParse] = useState<{
    parsed: ParsedG702Upload;
    mode: "replace" | "merge";
  } | null>(null);
  // The raw parsed retainage figure, kept separate from retainage_held so
  // it stays available for comparison no matter what retentionMode ends up
  // computing — never written into the form automatically, since whether
  // it's cumulative-to-date or this draw's own incremental amount can't be
  // told from the document alone.
  const [parsedRetainageFromDocument, setParsedRetainageFromDocument] = useState<number | null>(null);
  const [suggestedRetentionRate, setSuggestedRetentionRate] = useState<"0" | "5" | "10" | null>(null);
  const [retentionConfirmed, setRetentionConfirmed] = useState(false);
  const [unmatchedLineCount, setUnmatchedLineCount] = useState(0);
  // Recording a payment is a separate, additive action from editing the draw's
  // fields: "recording" turns the row on, "paymentOverride" is the amount the
  // user typed (null = still the live default), and one key per open of the
  // form makes a double-submit or a retried save record the payment once.
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentOverride, setPaymentOverride] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(businessTodayISO());
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setFormValues(drawToForm(editing));
    setLineAmounts(allocationsForDraw(allocations, editing?.id));
    setRetentionMode("manual");
    setAutoSelectedRetention(false);
    setParsing(false);
    setParseError(null);
    setParsedFileName(null);
    setNoAllocationsInLastParse(false);
    setPendingParse(null);
    setParsedRetainageFromDocument(null);
    setSuggestedRetentionRate(null);
    setRetentionConfirmed(false);
    setUnmatchedLineCount(0);
    setRecordingPayment(false);
    setPaymentOverride(null);
    setPaymentDate(businessTodayISO());
    setPaymentKey(crypto.randomUUID());
  }, [open, editing, allocations]);

  // The draw as the server has it now (the `editing` object is a snapshot from
  // when the form opened, so a void/correct done in this form would not show in
  // it), its receipts, and what a payment recorded on Save would be — worked
  // out from the CURRENT form values, including unsaved allocation edits.
  const currentDraw = editing ? draws.find((d) => d.id === editing.id) ?? editing : null;
  const receipts = useMemo(
    () => (editing ? (groupLiveReceipts(payments).get(editing.id) ?? []) : []),
    [payments, editing]
  );
  const alreadyReceived = Number(currentDraw?.amount_paid) || 0;
  const ownerPaid = useMemo(() => ownerPaidFromAmounts(lineAmounts, budgetLines), [lineAmounts, budgetLines]);
  const paymentIntent = formPaymentIntent({
    active: recordingPayment,
    override: paymentOverride,
    requested: Number(formValues.amount_requested) || 0,
    ownerPaid,
    alreadyReceived,
  });
  const defaultPaymentAmount = formPaymentIntent({
    active: true,
    override: null,
    requested: Number(formValues.amount_requested) || 0,
    ownerPaid,
    alreadyReceived,
  }).amount;

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

  const requestedAmount = Number(formValues.amount_requested) || 0;
  const retainageHeldAmount = Number(formValues.retainage_held) || 0;
  // Amount requested on a G702 is net of retention, but the schedule of
  // values "this draw" column is gross (before retention) — so the two only
  // reconcile once retention is added back onto what's requested.
  const allocationMismatch =
    budgetLines.length > 0 &&
    allocationsTotal > 0 &&
    allocationExceedsTolerance(allocationsTotal, requestedAmount, retainageHeldAmount);

  // Live, not one-shot: recomputed from whatever is actually in the field
  // right now, so it clears itself once retentionMode switches to a %
  // (computed-from-SOV values are incremental by construction and won't
  // trip this) instead of staying stale after a G702's raw retainage cell
  // gets overridden by a more reliable computed value.
  const retainageCaution =
    parsedFileName && retentionMode === "manual" && isImplausibleRetainage(retainageHeldAmount, requestedAmount)
      ? `This retainage (${formatCurrency(retainageHeldAmount)}) looks high for a single draw — confirm it isn't a cumulative total before saving, or switch Retention below to a % to compute it from the schedule of values instead.`
      : null;

  // See lib/retentionRelease.ts — retention held on every other POSTED
  // draw of this project (drafts excluded, prior releases netted in).
  const { retentionHeldToDate, releaseAmount, isInconsistent } = useMemo(
    () => computeRetentionRelease(draws, editing?.id),
    [draws, editing]
  );

  // Lines a parse couldn't match, or nothing entered yet post-upload — a %
  // rate computed against this set would understate the real total, so
  // that computation is flagged as unreliable rather than trusted silently.
  const retentionComputationUnreliable =
    parsedFileName !== null && (unmatchedLineCount > 0 || (budgetLines.length > 0 && allocationsTotal === 0));

  // Cumulative-document conversion is relative to the draws BEFORE this one
  // (by draw_number) — see convertCumulativeRetention for the ordering rule.
  // Recomputed from the live draw number so changing it re-derives the figure.
  const typedDrawNumber = formValues.draw_number.trim() === "" ? null : Number(formValues.draw_number);
  const cumulativeConversion = useMemo(
    () =>
      parsedRetainageFromDocument === null
        ? null
        : convertCumulativeRetention({
            draws,
            editingId: editing?.id,
            targetDrawNumber: typedDrawNumber,
            parsedCumulative: parsedRetainageFromDocument,
          }),
    [draws, editing, typedDrawNumber, parsedRetainageFromDocument]
  );

  const computedRetention = useMemo(() => {
    if (retentionMode === "manual") return null;
    if (retentionMode === "release") return releaseAmount;
    if (retentionMode === "document_cumulative") {
      if (cumulativeConversion?.status !== "ok") return null;
      return cumulativeConversion.incremental;
    }
    const rate = Number(retentionMode) / 100;
    const total = budgetLines.reduce((acc, line) => {
      if (line.retention_exempt) return acc;
      // A line's own rate (e.g. an elevator sub customarily held at a
      // different rate than the rest of the contract) wins over the
      // draw's selected uniform rate.
      const lineRate = line.retention_rate_override !== null ? line.retention_rate_override / 100 : rate;
      return acc + (Number(lineAmounts[line.id]) || 0) * lineRate;
    }, 0);
    return Math.round(total * 100) / 100;
  }, [retentionMode, budgetLines, lineAmounts, releaseAmount, cumulativeConversion]);

  useEffect(() => {
    if (computedRetention === null) return;
    setFormValues((v) => ({ ...v, retainage_held: String(computedRetention) }));
  }, [computedRetention]);

  // A stale confirmation shouldn't carry forward once the figure it was
  // given for could have changed — reset whenever the interpretation mode,
  // the allocations it might be computed from, or the parsed file itself
  // changes.
  useEffect(() => {
    setRetentionConfirmed(false);
  }, [retentionMode, lineAmounts, parsedFileName, formValues.draw_number]);

  async function handleSubmit(formData: FormData) {
    if (isSaving) return;
    if (pendingParse) {
      const ok = confirm(
        `${pendingParse.parsed.allocationsMatched} parsed schedule-of-values line${
          pendingParse.parsed.allocationsMatched === 1 ? "" : "s"
        } from ${parsedFileName} ${
          pendingParse.mode === "replace" ? "haven't replaced" : "haven't been merged into"
        } this draw's allocations yet — Apply or Discard them above first. Save without applying them?`
      );
      if (!ok) return;
    }
    if (parsedFileName && !retentionConfirmed) {
      const ok = confirm(
        `Retention for this draw (${formatCurrency(retainageHeldAmount)}) hasn't been explicitly confirmed since the upload. Save anyway?`
      );
      if (!ok) return;
    }
    if (allocationMismatch) {
      const diff = allocationsTotal - (requestedAmount + retainageHeldAmount);
      const ok = confirm(
        `Allocated ${formatCurrency(allocationsTotal)} doesn't match amount requested plus retainage ${formatCurrency(
          requestedAmount + retainageHeldAmount
        )} (difference ${formatCurrency(diff)}). Save anyway?`
      );
      if (!ok) return;
    }
    const allocationsPayload = budgetLines
      .map((line) => ({
        budget_line_id: line.id,
        amount: Number(lineAmounts[line.id]) || 0,
      }))
      .filter((a) => a.amount !== 0);
    formData.set("allocations", JSON.stringify(allocationsPayload));

    if (paymentIntent.mode !== "none") {
      if (paymentIntent.mode === "explicit" && !(paymentIntent.amount > 0)) {
        alert("Enter the payment amount, or choose Don't record.");
        return;
      }
      if (
        paymentIntent.overpaidBy > 0 &&
        !confirm(
          `${formatCurrency(paymentIntent.amount)} is ${formatCurrency(
            paymentIntent.overpaidBy
          )} more than what's still collectible on this draw. Record the overpayment?`
        )
      ) {
        return;
      }
      // Intent only — never an owner-paid total; the server works that out
      // itself from the allocations it saves.
      formData.set("payment_mode", paymentIntent.mode);
      formData.set("payment_amount", String(paymentIntent.amount));
      formData.set("payment_date", paymentDate);
      formData.set("payment_key", paymentKey);
      formData.set("confirm_overpayment", paymentIntent.overpaidBy > 0 ? "true" : "false");
    }
    setIsSaving(true);
    try {
      const result = await upsertDraw(formData);
      if (result?.error) {
        alert(result.error);
        return;
      }
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save draw.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateField<K extends keyof DrawFormValues>(key: K, value: DrawFormValues[K]) {
    setFormValues((v) => ({ ...v, [key]: value }));
  }

  function updateStatus(status: DrawStatus) {
    if (status !== "paid") {
      setFormValues((v) => ({ ...v, status }));
      return;
    }
    // Same rule as Mark Paid and the status dropdown: a draw moved to paid with
    // nothing received yet is offered what's collectible — requested, less
    // owner-paid scope (taken from the allocations as currently shown, saved or
    // not). Money already received is never overwritten, and a genuine partial
    // approval stays partial.
    const transition = paidTransition({
      requested: Number(formValues.amount_requested) || 0,
      approved: Number(formValues.amount_approved) || 0,
      alreadyReceived,
      ownerPaid,
    });
    setFormValues((v) => ({ ...v, status, amount_approved: String(transition.amountApproved) }));
    if (transition.pendingPayment) {
      setRecordingPayment(true);
      setPaymentOverride(null);
    }
  }

  function updateLineAmount(budgetLineId: string, value: string) {
    setLineAmounts((v) => ({ ...v, [budgetLineId]: value }));
  }

  async function processFile(file: File) {
    setParseError(null);
    setParsedFileName(null);
    setNoAllocationsInLastParse(false);
    setPendingParse(null);
    setParsedRetainageFromDocument(null);
    setSuggestedRetentionRate(null);
    setUnmatchedLineCount(0);

    if (file.size > MAX_G702_UPLOAD_BYTES) {
      setParseError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max is 20MB.`
      );
      return;
    }

    setParsing(true);
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
        amount_approved:
          parsed.amount_approved !== undefined ? String(parsed.amount_approved) : v.amount_approved,
        // retainage_held is deliberately NOT auto-filled from the parse —
        // a G702's "Total Retainage" cell is normally cumulative-to-date
        // per the AIA form standard, while this app's retainage_held is
        // incremental (this draw's own withholding), and nothing in the
        // document itself says which one it is. parsedRetainageFromDocument
        // below keeps the raw figure visible for comparison; which number
        // actually lands in this field is now always an explicit choice
        // via the Retention selector (manual entry, a %, "document total
        // minus held to date", or release) rather than a guess.
        status: v.status === "draft" ? "submitted" : v.status,
      }));

      if (parsed.retainage_held !== undefined) {
        setParsedRetainageFromDocument(parsed.retainage_held);
      }

      if (parsed.allocations.length > 0 || parsed.unmatchedLines.length > 0) {
        setPendingParse({ parsed, mode: "replace" });
      } else {
        setNoAllocationsInLastParse(true);
      }

      // Inference is now a suggestion, not an automatic switch — see
      // applySuggestedRetentionRate/dismissSuggestedRetentionRate below.
      // Only offered when the user hasn't already picked a mode, same as
      // before.
      if (retentionMode === "manual") {
        const inferredRate = inferRetentionRate(draws, editing?.id);
        if (inferredRate !== null) setSuggestedRetentionRate(inferredRate);
      }

      setParsedFileName(file.name);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setParsing(false);
    }
  }

  // Commits a reviewed parse into lineAmounts — the only place a parse
  // actually changes allocations, per the "surface before replacing"
  // requirement. Discarding (below) leaves lineAmounts exactly as it was.
  function applyPendingParse() {
    if (!pendingParse) return;
    setLineAmounts((prev) => applyParsedAllocations(prev, pendingParse.parsed.allocations, pendingParse.mode));
    setUnmatchedLineCount(pendingParse.parsed.unmatchedLines.length);
    setPendingParse(null);
  }

  function discardPendingParse() {
    setPendingParse(null);
  }

  function setPendingParseMode(mode: "replace" | "merge") {
    setPendingParse((p) => (p ? { ...p, mode } : p));
  }

  function applySuggestedRetentionRate() {
    if (!suggestedRetentionRate) return;
    setRetentionMode(suggestedRetentionRate);
    setAutoSelectedRetention(true);
    setSuggestedRetentionRate(null);
  }

  function dismissSuggestedRetentionRate() {
    setSuggestedRetentionRate(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!parsing) setIsDraggingFile(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingFile(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingFile(false);
    if (parsing) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
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

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed p-3 transition-colors ${
            isDraggingFile ? "border-primary bg-primary/10" : "border-border bg-muted"
          }`}
        >
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {editing
              ? "Re-upload a G702 (.xlsx or .pdf) to refresh this draw's numbers"
              : "Upload G702 (.xlsx or .pdf) to auto-fill this form"}
          </label>
          {editing && (
            <p className="text-xs text-muted-foreground mb-2">
              Useful if the lender rejected this draw or the amounts changed — this replaces
              the requested amount and dates below with the new file&rsquo;s numbers. Schedule-of-
              values lines and retention are reviewed below before anything changes.
            </p>
          )}
          <input
            type="file"
            accept=".xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
            onChange={handleFileUpload}
            disabled={parsing}
            className="text-sm w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">or drag and drop a file anywhere in this box</p>
          {parsing && <p className="text-xs text-muted-foreground mt-1">Reading file…</p>}
          {parseError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{parseError}</p>}
          {parsedFileName && !parsing && !parseError && (
            <p className="text-xs text-paid mt-1">
              Auto-filled from {parsedFileName}. Review the fields below before saving.
            </p>
          )}
          {noAllocationsInLastParse && !parsing && (
            <p className="text-xs text-muted-foreground mt-1">
              No schedule-of-values lines found in that file — this draw&rsquo;s allocations are unchanged.
            </p>
          )}
          {parsedRetainageFromDocument !== null && !parsing && (
            <p className="text-xs text-muted-foreground mt-1">
              Document&rsquo;s raw retainage figure: {formatCurrency(parsedRetainageFromDocument)} — ambiguous
              (could be cumulative-to-date rather than this draw&rsquo;s own amount). Pick how to interpret it
              in Retention below; it&rsquo;s never applied automatically.
            </p>
          )}
          {retainageCaution && !parsing && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{retainageCaution}</p>
          )}
        </div>

        {pendingParse && (
          <div className="rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 p-3 text-xs space-y-2">
            <p className="font-medium text-sky-900 dark:text-sky-100">
              {pendingParse.parsed.allocationsMatched} schedule-of-values line
              {pendingParse.parsed.allocationsMatched === 1 ? "" : "s"} parsed from {parsedFileName}
              {pendingParse.mode === "replace"
                ? " will replace this draw's current allocations."
                : " will be merged into this draw's current allocations."}
            </p>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input
                type="checkbox"
                checked={pendingParse.mode === "merge"}
                onChange={(e) => setPendingParseMode(e.target.checked ? "merge" : "replace")}
              />
              Merge into current allocations instead of replacing them
            </label>
            {pendingParse.parsed.unmatchedLines.length > 0 && (
              <div>
                <p className="text-amber-700 dark:text-amber-400">
                  {pendingParse.parsed.unmatchedLines.length} line
                  {pendingParse.parsed.unmatchedLines.length === 1 ? "" : "s"} couldn&rsquo;t be matched to a
                  budget line and won&rsquo;t be applied:
                </p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {pendingParse.parsed.unmatchedLines.map((l, i) => (
                    <li key={i}>
                      {l.item_number ? `${l.item_number} — ` : ""}
                      {l.description} ({formatCurrency(l.amount)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={applyPendingParse}
                className="rounded bg-primary text-background px-2 py-1 font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={discardPendingParse}
                className="rounded border border-border px-2 py-1"
              >
                Discard
              </button>
            </div>
          </div>
        )}

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
              min="0"
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
              min="0"
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
              className={`input ${retentionMode !== "manual" ? "bg-muted text-muted-foreground" : ""}`}
            />
            {retentionMode === "release" ? (
              isInconsistent ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  Prior draws show negative retainage on record ({formatCurrency(retentionHeldToDate)}) —
                  resolve that before releasing again. No release amount has been filled in.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Releases the {formatCurrency(retentionHeldToDate)} held across this project&rsquo;s
                  other posted draws.
                </p>
              )
            ) : retentionMode === "document_cumulative" ? (
              cumulativeConversion?.status === "ok" ? (
                <>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Document total ({formatCurrency(parsedRetainageFromDocument ?? 0)}) minus{" "}
                    {formatCurrency(cumulativeConversion.priorHeld)} held on the draws before Draw #
                    {formValues.draw_number} — later draws are ignored.
                  </p>
                  {cumulativeConversion.isDecrease && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      The document&rsquo;s cumulative total is below what earlier draws already held, so this
                      reads as a {formatCurrency(Math.abs(cumulativeConversion.incremental))} partial release
                      (entered as a negative). Confirm that&rsquo;s intended — it is not treated as a full release.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  {cumulativeConversion?.reason ?? "Upload a G702 first."}
                </p>
              )
            ) : retentionMode !== "manual" ? (
              <>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Computed from {retentionMode}% retention on the schedule of values below.
                  {autoSelectedRetention &&
                    " Applied from this project's prior draws' own withholding rate."}
                </p>
                {retentionComputationUnreliable && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    {unmatchedLineCount > 0
                      ? `${unmatchedLineCount} line${unmatchedLineCount === 1 ? "" : "s"} from the uploaded file couldn't be matched — this computed figure may be short.`
                      : "No schedule-of-values amounts are entered yet below — this computed figure is $0."}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                Negative releases previously withheld retention (e.g. the final draw).
              </p>
            )}
            {suggestedRetentionRate && (
              <p className="text-[11px] bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded px-2 py-1 mt-1">
                <span className="text-sky-900 dark:text-sky-100">
                  Inferred {suggestedRetentionRate}% retention from this project&rsquo;s prior draws.
                </span>{" "}
                <button
                  type="button"
                  onClick={applySuggestedRetentionRate}
                  className="underline font-medium text-sky-900 dark:text-sky-100"
                >
                  Apply
                </button>{" "}
                <button
                  type="button"
                  onClick={dismissSuggestedRetentionRate}
                  className="underline text-muted-foreground"
                >
                  Dismiss
                </button>
              </p>
            )}
            {parsedFileName && !retentionConfirmed && (
              <p className="text-[11px] mt-1">
                <span className="text-amber-700 dark:text-amber-400">
                  Retention not yet confirmed for this draw.
                </span>{" "}
                <button
                  type="button"
                  onClick={() => setRetentionConfirmed(true)}
                  className="underline font-medium text-foreground"
                >
                  Confirm {formatCurrency(retainageHeldAmount)}
                </button>
              </p>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </div>

        <DrawPaymentsPanel
          drawId={editing?.id ?? null}
          projectId={projectId}
          receipts={receipts}
          totalReceived={alreadyReceived}
          lastDate={currentDraw?.date_paid ?? null}
          recording={recordingPayment}
          onRecordingChange={(v) => {
            setRecordingPayment(v);
            if (!v) setPaymentOverride(null);
          }}
          amountText={paymentOverride ?? String(paymentIntent.mode === "none" ? defaultPaymentAmount : paymentIntent.amount)}
          onAmountChange={setPaymentOverride}
          paymentDate={paymentDate}
          onDateChange={setPaymentDate}
          overpaidBy={paymentIntent.overpaidBy}
          defaultAmount={defaultPaymentAmount}
        />

        {budgetLines.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="block text-xs font-medium text-muted-foreground">
                Schedule of values — amount billed this period, by line
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Retention
                  <select
                    value={retentionMode}
                    onChange={(e) => {
                      setRetentionMode(e.target.value as typeof retentionMode);
                      setAutoSelectedRetention(false);
                    }}
                    className="rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground"
                  >
                    <option value="manual">Manual</option>
                    <option value="0" disabled={retentionComputationUnreliable}>
                      0%
                    </option>
                    <option value="5" disabled={retentionComputationUnreliable}>
                      5%
                    </option>
                    <option value="10" disabled={retentionComputationUnreliable}>
                      10%
                    </option>
                    <option
                      value="document_cumulative"
                      disabled={cumulativeConversion === null || cumulativeConversion.status !== "ok"}
                      title={cumulativeConversion?.status === "unavailable" ? cumulativeConversion.reason : undefined}
                    >
                      Document total − held to date
                    </option>
                    <option value="release">Release retention</option>
                  </select>
                </label>
                <span
                  className={`text-xs ${allocationMismatch ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}
                >
                  {formatCurrency(allocationsTotal)} allocated
                  {allocationMismatch
                    ? ` · requested + retainage ${formatCurrency(requestedAmount + retainageHeldAmount)}`
                    : ""}
                </span>
              </div>
            </div>
            {allocationMismatch && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5 mb-2">
                Schedule of values total doesn&rsquo;t match the G702 amount requested plus retainage
                held. Check line billings before saving — lenders often reject a mismatch.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mb-2">
              Lines marked &ldquo;No retention&rdquo; in the Schedule of Values tab are excluded from the calculation.
            </p>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted text-muted-foreground uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">Line</th>
                    <th className="text-right px-2 py-1.5">Scheduled</th>
                    <th className="text-right px-2 py-1.5">Previous</th>
                    <th className="text-right px-2 py-1.5 w-28">This draw</th>
                    <th className="text-right px-2 py-1.5">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {budgetLines.map((line) => {
                    const previous = previousByLine.get(line.id) ?? 0;
                    const thisDraw = Number(lineAmounts[line.id]) || 0;
                    const balance = line.scheduled_value - previous - thisDraw;
                    return (
                      <tr key={line.id}>
                        <td className="px-2 py-1.5 text-foreground min-w-[14rem]">
                          {line.item_number ? `${line.item_number} — ` : ""}
                          {line.description}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">
                          {formatCurrency(line.scheduled_value)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">
                          {formatCurrency(previous)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={lineAmounts[line.id] ?? ""}
                            onChange={(e) => updateLineAmount(line.id, e.target.value)}
                            placeholder="0"
                            className="w-full rounded border border-border bg-card px-1.5 py-0.5 text-right text-xs text-foreground"
                          />
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right whitespace-nowrap ${
                            balance < 0 ? "text-invoiced" : "text-muted-foreground"
                          }`}
                        >
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
            disabled={isSaving}
            className="text-sm px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-background font-medium disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
