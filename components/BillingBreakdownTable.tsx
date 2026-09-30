import Link from "next/link";
import { GroupedBillingRow } from "@/lib/billing";
import { formatCurrency, formatDaysToPay } from "@/lib/format";
import { MIN_MEANINGFUL_OPEN_BALANCE } from "@/lib/aging";

// Shared by the By Project / By Developer / By Lender sections on the
// Billing Summary page — same GroupedBillingRow shape, same columns, only
// the grouping (and whether a row links anywhere) differs. Totals are
// summed from the rows themselves rather than trusted from the page's own
// YTD figures: every draw belongs to exactly one row in any grouping, so
// the sums are invariant to how they're grouped and this keeps the table
// honest on its own.
export default function BillingBreakdownTable({
  title,
  year,
  rows,
  hrefFor,
  emptyLabel,
}: {
  title: string;
  year: number;
  rows: GroupedBillingRow[];
  hrefFor?: (groupId: string) => string;
  emptyLabel: string;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      requested: acc.requested + r.requested,
      received: acc.received + r.received,
      onTimeCount: acc.onTimeCount + r.onTimeCount,
      lateCount: acc.lateCount + r.lateCount,
    }),
    { requested: 0, received: 0, onTimeCount: 0, lateCount: 0 }
  );

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">
        {title} ({year})
      </h2>

      {/* Mobile: one card per row */}
      <div className="sm:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.groupId} className="rounded-xl border border-border bg-card p-4">
            {hrefFor ? (
              <Link href={hrefFor(r.groupId)} className="font-medium text-foreground hover:underline">
                {r.groupName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{r.groupName}</span>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Billed</p>
                <p>{formatCurrency(r.requested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Received</p>
                <p className="text-paid">{formatCurrency(r.received)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Billed − received</p>
                <p className={r.requested - r.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""}>
                  {formatCurrency(r.requested - r.received)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg days to pay / approve</p>
                <p>
                  {formatDaysToPay(r.avgDaysToPay)} / {formatDaysToPay(r.avgDaysToApprove)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">On time</p>
                <OnTimeCell onTime={r.onTimeCount} late={r.lateCount} />
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        )}
        {rows.length > 0 && (
          <div className="rounded-xl border border-border bg-muted p-4 font-semibold">
            <p className="text-foreground">Total ({year})</p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-normal">Billed</p>
                <p>{formatCurrency(totals.requested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Received</p>
                <p className="text-paid">{formatCurrency(totals.received)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Billed − received</p>
                <p
                  className={
                    totals.requested - totals.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""
                  }
                >
                  {formatCurrency(totals.requested - totals.received)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">On time</p>
                <OnTimeCell onTime={totals.onTimeCount} late={totals.lateCount} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop/tablet: full table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">{title.replace("By ", "")}</th>
              <th className="text-right px-4 py-2">Billed</th>
              <th className="text-right px-4 py-2">Received</th>
              <th className="text-right px-4 py-2">Billed − received</th>
              <th className="text-right px-4 py-2">Avg days to pay</th>
              <th className="text-right px-4 py-2">Avg days to approve</th>
              <th className="text-right px-4 py-2">On time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.groupId} className="group hover:bg-muted">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
                  {hrefFor ? (
                    <Link
                      href={hrefFor(r.groupId)}
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.groupName}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{r.groupName}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.requested)}</td>
                <td className="px-4 py-2 text-right text-paid">{formatCurrency(r.received)}</td>
                <td
                  className={`px-4 py-2 text-right ${
                    r.requested - r.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""
                  }`}
                >
                  {formatCurrency(r.requested - r.received)}
                </td>
                <td className="px-4 py-2 text-right">{formatDaysToPay(r.avgDaysToPay)}</td>
                <td className="px-4 py-2 text-right">{formatDaysToPay(r.avgDaysToApprove)}</td>
                <td className="px-4 py-2 text-right">
                  <OnTimeCell onTime={r.onTimeCount} late={r.lateCount} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(totals.requested)}</td>
                <td className="px-4 py-2 text-right text-paid">{formatCurrency(totals.received)}</td>
                <td
                  className={`px-4 py-2 text-right ${
                    totals.requested - totals.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""
                  }`}
                >
                  {formatCurrency(totals.requested - totals.received)}
                </td>
                <td className="px-4 py-2 text-right" colSpan={2} />
                <td className="px-4 py-2 text-right">
                  <OnTimeCell onTime={totals.onTimeCount} late={totals.lateCount} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

function OnTimeCell({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  if (total === 0) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((onTime / total) * 100);
  return (
    <span className={late > 0 ? "text-amber-700 dark:text-amber-300" : "text-paid"}>
      {onTime}/{total} ({pct}%)
    </span>
  );
}
