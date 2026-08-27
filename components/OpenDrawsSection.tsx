"use client";

import { useState } from "react";
import Link from "next/link";
import { BudgetLine, DrawLineAllocation, OpenDraw, OwnerDraw } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { AGING_BUCKETS, AGING_BUCKET_BADGE_STYLE, AGING_BUCKET_LABEL, agingBucket, daysOpen } from "@/lib/aging";
import DrawStatusSelect from "@/components/DrawStatusSelect";
import MarkPaidButton from "@/components/MarkPaidButton";
import DrawFormModal from "@/components/DrawFormModal";
import { getDrawFormContext } from "@/app/draws/actions";

function openBalance(d: OpenDraw): number {
  if (d.status === "draft") return 0;
  return Math.max(0, (d.amount_requested ?? 0) - (d.amount_paid ?? 0));
}

function ageOf(d: OpenDraw): number {
  return daysOpen(d.date_submitted ?? d.created_at);
}

export default function OpenDrawsSection({ draws }: { draws: OpenDraw[] }) {
  const totalOpen = draws.reduce((acc, d) => acc + openBalance(d), 0);

  const agingSummary = AGING_BUCKETS.map((bucket) => {
    const inBucket = draws.filter((d) => agingBucket(ageOf(d)) === bucket);
    return {
      bucket,
      count: inBucket.length,
      amount: inBucket.reduce((acc, d) => acc + openBalance(d), 0),
    };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OwnerDraw | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [allocations, setAllocations] = useState<DrawLineAllocation[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openDraw(draw: OpenDraw) {
    setOpeningId(draw.id);
    try {
      const ctx = await getDrawFormContext(draw.project.id);
      setProjectId(draw.project.id);
      setBudgetLines(ctx.budgetLines);
      setAllocations(ctx.allocations);
      setEditing(draw);
      setModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open that draw.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900">Open Draws</h2>
        <span className="text-sm text-slate-500">
          {draws.length} open · {formatCurrency(totalOpen)} awaiting payment
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Draws with a balance still owed by the lender/owner — including any marked paid for less
        than requested — oldest first.
      </p>

      {draws.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {agingSummary.map(({ bucket, count, amount }) => (
            <div key={bucket} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">{AGING_BUCKET_LABEL[bucket]}</p>
              <p className="text-lg font-semibold text-slate-900 mt-0.5">{formatCurrency(amount)}</p>
              <p className="text-xs text-slate-400">
                {count} {count === 1 ? "draw" : "draws"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Project</th>
              <th className="text-left px-4 py-2">Draw #</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-left px-4 py-2">Age</th>
              <th className="text-right px-4 py-2">Requested</th>
              <th className="text-right px-4 py-2">Approved</th>
              <th className="text-right px-4 py-2">Outstanding</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draws.map((d) => {
              const age = ageOf(d);
              const bucket = agingBucket(age);
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/projects/${d.project.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {d.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => openDraw(d)}
                      disabled={openingId === d.id}
                      className="font-medium text-slate-900 hover:underline disabled:opacity-50"
                      title="Edit draw"
                    >
                      {openingId === d.id ? "…" : d.draw_number}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(d.date_submitted)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${AGING_BUCKET_BADGE_STYLE[bucket]}`}
                    >
                      {age}d
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d.amount_approved)}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">
                    {formatCurrency(openBalance(d))}
                  </td>
                  <td className="px-4 py-2">
                    <DrawStatusSelect drawId={d.id} projectId={d.project.id} status={d.status} />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <MarkPaidButton drawId={d.id} projectId={d.project.id} drawNumber={d.draw_number} />
                  </td>
                </tr>
              );
            })}
            {draws.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  No open draws. Everything invoiced has been paid.
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
