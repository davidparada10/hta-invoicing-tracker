"use client";

import { useState, useTransition } from "react";
import { markDrawPaid } from "@/app/draws/actions";
import { formatCurrency } from "@/lib/format";
import Modal from "@/components/Modal";

export default function MarkPaidButton({
  drawId,
  projectId,
  drawNumber,
  amountRequested,
  amountPaid,
  className,
}: {
  drawId: string;
  projectId: string;
  drawNumber: number;
  amountRequested: number;
  amountPaid: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const outstanding = Math.max(0, (amountRequested ?? 0) - (amountPaid ?? 0));
  const [amount, setAmount] = useState(String(outstanding));
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setAmount(String(outstanding));
    setDatePaid(new Date().toISOString().slice(0, 10));
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const received = Number(amount);
    if (!(received > 0)) return;
    startTransition(async () => {
      try {
        await markDrawPaid(drawId, projectId, received, datePaid || undefined);
        setOpen(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not mark paid.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={isPending}
        className={
          className ??
          "text-emerald-600 hover:text-emerald-800 text-xs font-medium disabled:opacity-50"
        }
      >
        {isPending ? "Marking…" : "Mark Paid"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Mark Draw #${drawNumber} paid`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-slate-500">
            Requested {formatCurrency(amountRequested)}
            {(amountPaid ?? 0) > 0 ? ` · already paid ${formatCurrency(amountPaid)}` : ""}
            {` · outstanding ${formatCurrency(outstanding)}`}
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Amount received</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Date paid</span>
            <input
              type="date"
              required
              value={datePaid}
              onChange={(e) => setDatePaid(e.target.value)}
              className="input"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Record payment"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
