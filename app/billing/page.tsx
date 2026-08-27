import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getBillingReport, getProjectBillingBreakdown } from "@/lib/data";
import { currentQuarter } from "@/lib/billing";
import { formatCurrency, formatDaysToPay } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUARTER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Q1 (Jan–Mar)",
  2: "Q2 (Apr–Jun)",
  3: "Q3 (Jul–Sep)",
  4: "Q4 (Oct–Dec)",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const year = Number(searchParams.year) || thisYear;
  const isCurrentYear = year === thisYear;
  const activeQuarter = isCurrentYear ? currentQuarter(now) : null;

  const [report, projectRows] = await Promise.all([
    getBillingReport(year),
    getProjectBillingBreakdown(year),
  ]);
  const outstandingYtd = report.ytdRequested - report.ytdReceived;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-foreground">Billing Summary</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/billing?year=${year - 1}`} className="text-muted-foreground hover:text-foreground">
              ← {year - 1}
            </Link>
            <span className="font-medium text-foreground">{year}</span>
            {year < thisYear ? (
              <Link href={`/billing?year=${year + 1}`} className="text-muted-foreground hover:text-foreground">
                {year + 1} →
              </Link>
            ) : (
              <span className="text-muted-foreground">{year + 1} →</span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Amounts billed (submitted) vs. actually received (paid), by quarter, across all
          projects. Billed and received can land in different quarters — this is cash-basis, not
          accrual.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Billed {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {formatCurrency(report.ytdRequested)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Received {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(report.ytdReceived)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Outstanding {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-invoiced mt-1">
              {formatCurrency(outstandingYtd)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Avg days to pay
            </p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {formatDaysToPay(report.ytdAvgDaysToPay)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Quarter</th>
                <th className="text-right px-4 py-2">Billed</th>
                <th className="text-right px-4 py-2">Received</th>
                <th className="text-right px-4 py-2">Outstanding</th>
                <th className="text-right px-4 py-2">Avg days to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.quarters.map((q) => {
                const isActive = q.quarter === activeQuarter;
                return (
                  <tr key={q.quarter} className={isActive ? "bg-amber-50 dark:bg-amber-950/40" : ""}>
                    <td
                      className={`px-4 py-2 font-medium text-foreground sticky left-0 z-10 ${
                        isActive ? "bg-amber-50 dark:bg-amber-950/40" : "bg-card"
                      }`}
                    >
                      {QUARTER_LABEL[q.quarter]}
                      {isActive && (
                        <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                          (quarter to date)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(q.requested)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(q.received)}
                    </td>
                    <td className="px-4 py-2 text-right text-invoiced">
                      {formatCurrency(q.requested - q.received)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatDaysToPay(q.avgDaysToPay)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(report.ytdRequested)}</td>
                <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(report.ytdReceived)}
                </td>
                <td className="px-4 py-2 text-right text-invoiced">
                  {formatCurrency(outstandingYtd)}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatDaysToPay(report.ytdAvgDaysToPay)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">By Project ({year})</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Project</th>
                <th className="text-right px-4 py-2">Billed</th>
                <th className="text-right px-4 py-2">Received</th>
                <th className="text-right px-4 py-2">Outstanding</th>
                <th className="text-right px-4 py-2">Avg days to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projectRows.map((p) => (
                <tr key={p.projectId} className="group hover:bg-muted">
                  <td className="px-4 py-2 sticky left-0 z-10 bg-card group-hover:bg-muted">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {p.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(p.requested)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(p.received)}
                  </td>
                  <td className="px-4 py-2 text-right text-invoiced">
                    {formatCurrency(p.requested - p.received)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatDaysToPay(p.avgDaysToPay)}
                  </td>
                </tr>
              ))}
              {projectRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No billing activity for {year}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(report.ytdRequested)}</td>
                <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(report.ytdReceived)}
                </td>
                <td className="px-4 py-2 text-right text-invoiced">
                  {formatCurrency(outstandingYtd)}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatDaysToPay(report.ytdAvgDaysToPay)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </main>
    </div>
  );
}
