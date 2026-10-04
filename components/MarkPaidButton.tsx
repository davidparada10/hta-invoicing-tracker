"use client";

import { useState, useTransition } from "react";
import { markDrawPaid } from "@/app/draws/actions";
import { businessTodayISO, formatCurrency } from "@/lib/format";
import { defaultCashReceived } from "@/lib/paymentDefaults";
import Modal from "@/components/Modal";
import { withScrollPreserved } from "@/lib/preserveScroll";

export default function MarkPaidButton({
  drawId,
  projectId,
  drawNumber,
  amountRequested,
  amountPaid,
  excludedAllocated = 0,
  className,
}: {
  drawId: string;
  projectId: string;
  drawNumber: number;
  amountRequested: number;
  amountPaid: number;
  // Owner-paid, non-HTA scope already billed against this draw — netted
  // out so the default here matches openBalance() (the shared "what's
  // still actually collectible by HTA" calculation used everywhere else).
  // The server independently recomputes this from the draw's saved
  // allocations — it never reads this prop — so this only affects what the
  // field starts pre-filled with, and when to ask about an overpayment.
  excludedAllocated?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const outstanding = defaultCashReceived({
    requested: amountRequested ?? 0,
    ownerPaid: excludedAllocated ?? 0,
    alreadyReceived: amountPaid ?? 0,
  });
  const [amount, setAmount] = useState(String(outstanding));
  const [datePaid, setDatePaid] = useState(businessTodayISO());
  // One retry key per open of the dialog: a double-click or a retried request
  // is recorded once, while reopening the dialog starts a fresh payment.
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setAmount(String(outstanding));
    setDatePaid(businessTodayISO());
    setPaymentKey(crypto.randomUUID());
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const received = Number(amount);
    if (!(received > 0)) return;
    // More than what's still collectible is allowed (real draws are
    // overpaid sometimes) but only on purpose.
    const overpayment = received > outstanding + 0.005;
    if (
      overpayment &&
      !confirm(
        `${formatCurrency(received)} is ${formatCurrency(received - outstanding)} more than the ${formatCurrency(
          outstanding
        )} still collectible on this draw. Record the overpayment?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await withScrollPreserved(() =>
          markDrawPaid(drawId, projectId, received, datePaid || undefined, {
            idempotencyKey: paymentKey,
            confirmOverpayment: overpayment,
          })
        );
        if (result?.error) {
          alert(result.error);
          return;
        }
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
          "text-paid hover:opacity-70 text-xs font-medium disabled:opacity-50"
        }
      >
        {isPending ? "Marking…" : "Mark Paid"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Mark Draw #${drawNumber} paid`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Requested {formatCurrency(amountRequested)}
            {(excludedAllocated ?? 0) > 0 ? ` · owner-paid scope ${formatCurrency(excludedAllocated)}` : ""}
            {(amountPaid ?? 0) > 0 ? ` · already received ${formatCurrency(amountPaid)}` : ""}
            {` · outstanding ${formatCurrency(outstanding)}`}
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Amount received</span>
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
            <span className="block text-xs font-medium text-muted-foreground mb-1">Date paid</span>
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
              className="text-sm px-3 py-1.5 rounded-lg border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm px-3 py-1.5 rounded-lg bg-primary text-background font-medium disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Record payment"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
