"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BudgetLine, DrawLineAllocation, OpenDraw, OwnerDraw } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  AGING_BUCKETS,
  AGING_BUCKET_BADGE_STYLE,
  AGING_BUCKET_CARD_STYLE,
  AGING_BUCKET_LABEL,
  AgingBucket,
  agingBucket,
  daysOpen,
} from "@/lib/aging";
import DrawStatusSelect from "@/components/DrawStatusSelect";
import MarkPaidButton from "@/components/MarkPaidButton";
import DrawFormModal from "@/components/DrawFormModal";
import { getDrawFormContext } from "@/app/draws/actions";

type BucketFilter = AgingBucket | "stale" | null;

function openBalance(d: OpenDraw): number {
  if (d.status === "draft") return 0;
  return Math.max(0, (d.amount_requested ?? 0) - (d.amount_paid ?? 0));
}

function ageOf(d: OpenDraw): number {
  return daysOpen(d.date_submitted ?? d.created_at);
}

function matchesFilter(d: OpenDraw, filter: BucketFilter): boolean {
  if (!filter) return true;
  const bucket = agingBucket(ageOf(d));
  if (filter === "stale") return bucket === "61-90" || bucket === "90+";
  return bucket === filter;
}

function parseAgingParam(value: string | undefined): BucketFilter {
  if (value === "stale") return "stale";
  if (value && (AGING_BUCKETS as string[]).includes(value)) return value as AgingBucket;
  return null;
}

export default function OpenDrawsSection({
  draws,
  initialAging,
}: {
  draws: OpenDraw[];
  initialAging?: string;
}) {
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>(() => parseAgingParam(initialAging));

  useEffect(() => {
    const fromUrl = parseAgingParam(initialAging);
    if (fromUrl) setBucketFilter(fromUrl);
  }, [initialAging]);

  const totalOpen = draws.reduce((acc, d) => acc + openBalance(d), 0);
  const displayed = useMemo(
    () => draws.filter((d) => matchesFilter(d, bucketFilter)),
    [draws, bucketFilter]
  );
  const displayedOpen = displayed.reduce((acc, d) => acc + openBalance(d), 0);

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

  function toggleBucket(bucket: AgingBucket) {
    setBucketFilter((current) => (current === bucket ? null : bucket));
  }

  const bucketSelected = (bucket: AgingBucket) =>
    bucketFilter === bucket || (bucketFilter === "stale" && (bucket === "61-90" || bucket === "90+"));

  return (
    <div id="open-draws" className="mb-8 scroll-mt-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-foreground">Open Draws</h2>
        <span className="text-sm text-muted-foreground">
          {bucketFilter
            ? `${displayed.length} of ${draws.length} open · ${formatCurrency(displayedOpen)} showing`
            : `${draws.length} open · ${formatCurrency(totalOpen)} awaiting payment`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Draws with a balance still owed by the lender/owner — including any marked paid for less
        than requested — oldest first.
        {bucketFilter && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => setBucketFilter(null)}
              className="text-foreground underline hover:text-foreground"
            >
              Clear age filter
            </button>
          </>
        )}
      </p>

      {draws.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {agingSummary.map(({ bucket, count, amount }) => (
            <button
              key={bucket}
              type="button"
              onClick={() => toggleBucket(bucket)}
              aria-pressed={bucketSelected(bucket)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                bucketSelected(bucket)
                  ? AGING_BUCKET_CARD_STYLE[bucket].selected
                  : AGING_BUCKET_CARD_STYLE[bucket].idle
              }`}
            >
              <p className="text-xs font-medium opacity-80">{AGING_BUCKET_LABEL[bucket]}</p>
              <p className="text-lg font-semibold mt-0.5">{formatCurrency(amount)}</p>
              <p className="text-xs opacity-70">
                {count} {count === 1 ? "draw" : "draws"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Mobile: one card per draw — avoids horizontal scrolling through 8+ columns */}
      <div className="sm:hidden space-y-3">
        {displayed.map((d) => {
          const age = ageOf(d);
          const bucket = agingBucket(age);
          return (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/projects/${d.project.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {d.project.name}
                </Link>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${AGING_BUCKET_BADGE_STYLE[bucket]}`}
                >
                  {age}d
                </span>
              </div>
              <button
                type="button"
                onClick={() => openDraw(d)}
                disabled={openingId === d.id}
                className="text-xs text-muted-foreground hover:underline disabled:opacity-50 mt-0.5"
              >
                {openingId === d.id ? "Opening…" : `Draw #${d.draw_number}`} · Submitted{" "}
                {formatDate(d.date_submitted)}
              </button>

              <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Requested</p>
                  <p>{formatCurrency(d.amount_requested)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p>{formatCurrency(d.amount_approved)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-medium text-invoiced">{formatCurrency(openBalance(d))}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
                <DrawStatusSelect drawId={d.id} projectId={d.project.id} status={d.status} />
                <MarkPaidButton
                  drawId={d.id}
                  projectId={d.project.id}
                  drawNumber={d.draw_number}
                  amountRequested={d.amount_requested}
                  amountPaid={d.amount_paid}
                />
              </div>
            </div>
          );
        })}
        {displayed.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
            {draws.length === 0
              ? "No open draws. Everything invoiced has been paid."
              : "No open draws in this age range."}
          </div>
        )}
      </div>

      {/* Desktop/tablet: full table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Project</th>
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
          <tbody className="divide-y divide-border">
            {displayed.map((d) => {
              const age = ageOf(d);
              const bucket = agingBucket(age);
              return (
                <tr key={d.id} className="group hover:bg-muted">
                  <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
                    <Link
                      href={`/projects/${d.project.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {d.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => openDraw(d)}
                      disabled={openingId === d.id}
                      className="font-medium text-foreground hover:underline disabled:opacity-50"
                      title="Edit draw"
                    >
                      {openingId === d.id ? "…" : d.draw_number}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(d.date_submitted)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${AGING_BUCKET_BADGE_STYLE[bucket]}`}
                    >
                      {age}d
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(d.amount_approved)}</td>
                  <td className="px-4 py-2 text-right font-medium text-invoiced">
                    {formatCurrency(openBalance(d))}
                  </td>
                  <td className="px-4 py-2">
                    <DrawStatusSelect drawId={d.id} projectId={d.project.id} status={d.status} />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <MarkPaidButton
                      drawId={d.id}
                      projectId={d.project.id}
                      drawNumber={d.draw_number}
                      amountRequested={d.amount_requested}
                      amountPaid={d.amount_paid}
                    />
                  </td>
                </tr>
              );
            })}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                  {draws.length === 0
                    ? "No open draws. Everything invoiced has been paid."
                    : "No open draws in this age range."}
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
