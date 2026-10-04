"use client";

import { useState, useTransition } from "react";
import { correctPayment, voidPayment } from "@/app/draws/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DrawPayment } from "@/lib/paymentHistory";

// The draw edit form's payments section: the cumulative total received
// (read-only — it's a cache of the receipts, never typed over), each receipt
// with its own amount and date, and a row to record another payment. Voiding or
// correcting a receipt goes straight to the server (it changes saved money, not
// form state), so it asks first.
export default function DrawPaymentsPanel({
  drawId,
  projectId,
  receipts,
  totalReceived,
  lastDate,
  recording,
  onRecordingChange,
  amountText,
  onAmountChange,
  paymentDate,
  onDateChange,
  overpaidBy,
  defaultAmount,
}: {
  drawId: string | null;
  projectId: string;
  receipts: DrawPayment[];
  totalReceived: number;
  lastDate: string | null;
  recording: boolean;
  onRecordingChange: (v: boolean) => void;
  amountText: string;
  onAmountChange: (v: string) => void;
  paymentDate: string;
  onDateChange: (v: string) => void;
  overpaidBy: number;
  defaultAmount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState<{ id: string; amount: string; date: string; key: string } | null>(null);

  function handleVoid(r: DrawPayment) {
    if (!drawId) return;
    if (!confirm(`Void the ${formatCurrency(r.amount)} payment received ${formatDate(r.date_received)}? It stays in the history, marked void.`)) return;
    startTransition(async () => {
      const result = await voidPayment(r.id, drawId, projectId);
      if (result?.error) alert(result.error);
    });
  }

  function handleCorrect() {
    if (!drawId || !correcting) return;
    const amount = Number(correcting.amount);
    if (!(amount > 0)) {
      alert("Amount received must be greater than zero.");
      return;
    }
    startTransition(async () => {
      const result = await correctPayment(correcting.id, drawId, projectId, amount, correcting.date, correcting.key);
      if (result?.error) {
        alert(result.error);
        return;
      }
      setCorrecting(null);
    });
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Payments received</span>
        <span className="text-sm text-foreground">
          Total received <strong className="tabular-nums">{formatCurrency(totalReceived)}</strong>
          {lastDate ? <span className="text-muted-foreground"> · last {formatDate(lastDate)}</span> : null}
        </span>
      </div>

      {receipts.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {receipts.map((r) =>
            correcting?.id === r.id ? (
              <li key={r.id} className="py-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={correcting.amount}
                    onChange={(e) => setCorrecting({ ...correcting, amount: e.target.value })}
                    className="input mt-1 w-36"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Date
                  <input
                    type="date"
                    value={correcting.date}
                    onChange={(e) => setCorrecting({ ...correcting, date: e.target.value })}
                    className="input mt-1"
                  />
                </label>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCorrect}
                  className="text-xs px-2 py-1 rounded bg-primary text-background font-medium disabled:opacity-50"
                >
                  Save correction
                </button>
                <button type="button" onClick={() => setCorrecting(null)} className="text-xs px-2 py-1 rounded border border-border">
                  Cancel
                </button>
              </li>
            ) : (
              <li key={r.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="tabular-nums text-foreground">
                  {formatCurrency(r.amount)}{" "}
                  <span className="text-muted-foreground">
                    · {formatDate(r.date_received)}
                    {r.date_inferred ? " (date estimated)" : ""}
                    {r.source === "ai" ? " · via assistant" : ""}
                  </span>
                </span>
                {drawId && (
                  <span className="flex gap-3 text-xs">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        setCorrecting({
                          id: r.id,
                          amount: String(r.amount),
                          date: r.date_received,
                          key: crypto.randomUUID(),
                        })
                      }
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleVoid(r)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Void
                    </button>
                  </span>
                )}
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {totalReceived > 0
            ? "A total is on record for this draw, but it has no individual payments yet."
            : "No payments recorded yet."}
        </p>
      )}

      {recording ? (
        <div className="rounded-md bg-muted p-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Payment to record
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountText}
                onChange={(e) => onAmountChange(e.target.value)}
                className="input mt-1 w-40"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Date received
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="input mt-1"
              />
            </label>
            <button
              type="button"
              onClick={() => onRecordingChange(false)}
              className="text-xs px-2 py-1 rounded border border-border"
            >
              Don&rsquo;t record
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Recorded when you save, added to what&rsquo;s already received. The suggested amount is{" "}
            {formatCurrency(defaultAmount)} (requested, less owner-paid scope, less what&rsquo;s already received).
          </p>
          {overpaidBy > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              This is {formatCurrency(overpaidBy)} more than what&rsquo;s still collectible — you&rsquo;ll be asked to
              confirm the overpayment on save.
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onRecordingChange(true)}
          className="text-xs font-medium text-paid hover:opacity-70"
        >
          + Record a payment
        </button>
      )}
    </div>
  );
}

