"use client";

import { useTransition } from "react";
import { OwnerDraw, BudgetLine } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { restoreDraw } from "@/app/draws/actions";
import { restoreBudgetLine } from "@/app/budget/actions";

export default function TrashSection({
  projectId,
  deletedDraws,
  deletedBudgetLines,
}: {
  projectId: string;
  deletedDraws: OwnerDraw[];
  deletedBudgetLines: BudgetLine[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleRestoreDraw(draw: OwnerDraw) {
    startTransition(async () => {
      try {
        await restoreDraw(draw.id, projectId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not restore draw.");
      }
    });
  }

  function handleRestoreBudgetLine(line: BudgetLine) {
    startTransition(async () => {
      try {
        await restoreBudgetLine(line.id, projectId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not restore line item.");
      }
    });
  }

  const nothingDeleted = deletedDraws.length === 0 && deletedBudgetLines.length === 0;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Deleted draws and budget lines stay here for 30 days before being permanently removed.
      </p>

      {nothingDeleted && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
          Nothing in trash.
        </div>
      )}

      {deletedDraws.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Owner Draws ({deletedDraws.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Draw #</th>
                  <th className="text-left px-4 py-2">Period</th>
                  <th className="text-right px-4 py-2">Requested</th>
                  <th className="text-left px-4 py-2">Deleted</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deletedDraws.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-medium text-foreground">{d.draw_number}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(d.period_start)} – {formatDate(d.period_end)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(d.deleted_at)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleRestoreDraw(d)}
                        disabled={isPending}
                        className="text-paid hover:opacity-70 text-xs font-medium disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deletedBudgetLines.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Schedule of Values ({deletedBudgetLines.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Item #</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-right px-4 py-2">Scheduled Value</th>
                  <th className="text-left px-4 py-2">Deleted</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deletedBudgetLines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 text-muted-foreground">{l.item_number ?? "—"}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{l.description}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(l.scheduled_value)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(l.deleted_at)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleRestoreBudgetLine(l)}
                        disabled={isPending}
                        className="text-paid hover:opacity-70 text-xs font-medium disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
