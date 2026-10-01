import SiteHeader from "@/components/SiteHeader";
import {
  getBillingReport,
  getProjectBillingBreakdown,
  getDeveloperBillingBreakdown,
  getLenderBillingBreakdown,
  getShortPaymentSummary,
  getDashboardData,
  MIN_MEANINGFUL_OPEN_BALANCE,
} from "@/lib/data";
import { currentQuarter } from "@/lib/billing";
import { businessToday, formatCurrency, formatDaysToPay } from "@/lib/format";
import ExportCsvButton from "@/components/ExportCsvButton";
import BillingBreakdownTable from "@/components/BillingBreakdownTable";
import Link from "next/link";

export const dynamic = "force-dynamic";

const QUARTER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Q1 (Jan–Mar)",
  2: "Q2 (Apr–Jun)",
  3: "Q3 (Jul–Sep)",
  4: "Q4 (Oct–Dec)",
};

export default async function BillingPage(
  props: {
    searchParams: Promise<{ year?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const now = businessToday();
  const thisYear = now.getFullYear();
  const year = Number(searchParams.year) || thisYear;
  const isCurrentYear = year === thisYear;
  const activeQuarter = isCurrentYear ? currentQuarter(now) : null;

  const [report, projectRows, developerRows, lenderRows, shortPayments, dashboard] = await Promise.all([
    getBillingReport(year),
    getProjectBillingBreakdown(year),
    getDeveloperBillingBreakdown(year),
    getLenderBillingBreakdown(year),
    getShortPaymentSummary(year),
    getDashboardData(),
  ]);
  // Billed minus received *within a period* — not the same thing as what's
  // actually still owed. A draw billed in December and paid in January
  // makes January's (or that year's) activity go negative even though
  // that draw itself has zero outstanding balance by the time it's paid;
  // conversely a draw billed and paid in the same period nets to zero here
  // regardless of how large either side was. Deliberately not clamped to
  // zero — a negative period is real information (more got collected than
  // billed that period), not an error to hide.
  const activityDiffYtd = report.ytdRequested - report.ytdReceived;
  // The actual current outstanding balance — sum of each draw's own
  // collectible balance (requested minus owner-paid scope minus paid,
  // floored per-draw so an overpayment on one draw can't mask an unpaid
  // balance on another), portfolio-wide and as of today. Not scoped to
  // `year`: a balance still owed doesn't stop being owed because the page
  // is showing a different year.
  const currentOutstanding = dashboard.totals.totalOpenToOwner;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <div className="flex items-center justify-between mb-1 gap-3">
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
            <ExportCsvButton
              filename={`billing-summary-${year}.csv`}
              sections={[
                {
                  title: "Current Outstanding (portfolio, all years, as of today)",
                  headers: ["Current Outstanding"],
                  rows: [[currentOutstanding]],
                },
                {
                  title: `Short-paid draws (${year})`,
                  headers: ["Draws paid short of approved", "Total gap (positive = underpaid)"],
                  rows: [[shortPayments.count, shortPayments.totalGap]],
                },
                {
                  title: `By Quarter (${year})`,
                  headers: [
                    "Quarter",
                    "Billed",
                    "Received",
                    "Billed − received",
                    "Avg Days to Pay",
                    "Avg Days to Approve",
                  ],
                  rows: [
                    ...report.quarters.map((q) => [
                      QUARTER_LABEL[q.quarter],
                      q.requested,
                      q.received,
                      q.requested - q.received,
                      formatDaysToPay(q.avgDaysToPay),
                      formatDaysToPay(q.avgDaysToApprove),
                    ]),
                    [
                      `Total (${year})`,
                      report.ytdRequested,
                      report.ytdReceived,
                      activityDiffYtd,
                      formatDaysToPay(report.ytdAvgDaysToPay),
                      formatDaysToPay(report.ytdAvgDaysToApprove),
                    ],
                  ],
                },
                ...[
                  { title: "By Project", rows: projectRows },
                  { title: "By Developer", rows: developerRows },
                  { title: "By Lender", rows: lenderRows },
                ].map(({ title, rows }) => ({
                  title: `${title} (${year})`,
                  headers: [
                    title.replace("By ", ""),
                    "Billed",
                    "Received",
                    "Billed − received",
                    "Avg Days to Pay",
                    "Avg Days to Approve",
                    "On time",
                    "Late",
                  ],
                  rows: rows.map((r) => [
                    r.groupName,
                    r.requested,
                    r.received,
                    r.requested - r.received,
                    formatDaysToPay(r.avgDaysToPay),
                    formatDaysToPay(r.avgDaysToApprove),
                    r.onTimeCount,
                    r.lateCount,
                  ]),
                })),
              ]}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Amounts billed (submitted) vs. actually received (paid), by quarter, across all
          projects. Billed and received can land in different quarters — this is cash-basis, not
          accrual.
        </p>

        {/* Hero total — same ledger treatment as the dashboard and project
            pages. This is the true current outstanding balance (per-draw
            collectible balances, portfolio-wide, as of today) — not scoped
            to the selected year, since a balance still owed doesn't stop
            being owed because the page is showing a different year. */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Current Outstanding (all years)
        </p>
        <p
          className={`text-4xl sm:text-5xl font-semibold tracking-tight ${
            currentOutstanding > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : "text-foreground"
          }`}
        >
          {formatCurrency(currentOutstanding)}
        </p>
        <div className="border-t border-foreground/70 border-b-[3px] border-b-foreground mt-3 mb-6" />

        <div className="border-t border-border mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-6 border-b border-border">
            <div className="py-3">
              <p className="text-xs text-muted-foreground mb-1">
                Billed {isCurrentYear ? "YTD" : year}
              </p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(report.ytdRequested)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">
                Received {isCurrentYear ? "YTD" : year}
              </p>
              <p className="text-xl font-semibold text-paid">
                {formatCurrency(report.ytdReceived)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1" title="Billed minus received within this year — not the same as current outstanding. A draw billed in December and paid in January makes that period's figure negative even though the draw itself is fully paid.">
                Billed − received {isCurrentYear ? "YTD" : year}
              </p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(activityDiffYtd)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1" title="Time from submitted to paid.">
                Avg days to pay
              </p>
              <p className="text-xl font-semibold text-foreground">
                {formatDaysToPay(report.ytdAvgDaysToPay)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p
                className="text-xs text-muted-foreground mb-1"
                title="Time from submitted to approved — the owner/lender's own turnaround, separate from how long it then takes to actually get paid."
              >
                Avg days to approve
              </p>
              <p className="text-xl font-semibold text-foreground">
                {formatDaysToPay(report.ytdAvgDaysToApprove)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p
                className="text-xs mb-1"
                title="A 'paid' draw whose amount_paid doesn't match what was approved — permanent, not a normal pending balance, so easy to miss once the status reads paid."
              >
                <span className={shortPayments.count > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
                  Short-paid {isCurrentYear ? "YTD" : year}
                </span>
              </p>
              <p
                className={`text-xl font-semibold ${
                  shortPayments.count > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                }`}
              >
                {shortPayments.count === 0
                  ? "None"
                  : `${formatCurrency(Math.abs(shortPayments.totalGap))} (${shortPayments.count})`}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile: one card per quarter */}
        <div className="sm:hidden space-y-3">
          {report.quarters.map((q) => {
            const isActive = q.quarter === activeQuarter;
            return (
              <div
                key={q.quarter}
                className={`rounded-xl border border-border bg-card p-4 ${
                  isActive ? "border-l-[3px] border-l-amber-500 dark:border-l-amber-600" : ""
                }`}
              >
                <p className="font-medium text-foreground">
                  {QUARTER_LABEL[q.quarter]}
                  {isActive && (
                    <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                      (quarter to date)
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Billed</p>
                    <p>{formatCurrency(q.requested)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="text-paid">{formatCurrency(q.received)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Billed − received</p>
                    <p className={q.requested - q.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""}>
                      {formatCurrency(q.requested - q.received)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg days to pay</p>
                    <p>{formatDaysToPay(q.avgDaysToPay)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg days to approve</p>
                    <p>{formatDaysToPay(q.avgDaysToApprove)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-border bg-muted p-4 font-semibold">
            <p className="text-foreground">Total ({year})</p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-normal">Billed</p>
                <p>{formatCurrency(report.ytdRequested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Received</p>
                <p className="text-paid">{formatCurrency(report.ytdReceived)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Billed − received</p>
                <p className={activityDiffYtd > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""}>
                  {formatCurrency(activityDiffYtd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Avg days to pay</p>
                <p>{formatDaysToPay(report.ytdAvgDaysToPay)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-normal">Avg days to approve</p>
                <p>{formatDaysToPay(report.ytdAvgDaysToApprove)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop/tablet: full table */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-muted">Quarter</th>
                <th className="text-right px-4 py-2">Billed</th>
                <th className="text-right px-4 py-2">Received</th>
                <th className="text-right px-4 py-2">Billed − received</th>
                <th className="text-right px-4 py-2">Avg days to pay</th>
                <th className="text-right px-4 py-2">Avg days to approve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.quarters.map((q) => {
                const isActive = q.quarter === activeQuarter;
                return (
                  <tr key={q.quarter}>
                    <td
                      className={`px-4 py-2 font-medium text-foreground sticky left-0 z-10 bg-card ${
                        isActive ? "border-l-[3px] border-l-amber-500 dark:border-l-amber-600" : ""
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
                    <td className="px-4 py-2 text-right text-paid">
                      {formatCurrency(q.received)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${
                        q.requested - q.received > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""
                      }`}
                    >
                      {formatCurrency(q.requested - q.received)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatDaysToPay(q.avgDaysToPay)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatDaysToPay(q.avgDaysToApprove)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="px-4 py-2 sticky left-0 z-10 bg-card">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(report.ytdRequested)}</td>
                <td className="px-4 py-2 text-right text-paid">
                  {formatCurrency(report.ytdReceived)}
                </td>
                <td
                  className={`px-4 py-2 text-right ${
                    activityDiffYtd > MIN_MEANINGFUL_OPEN_BALANCE ? "text-invoiced" : ""
                  }`}
                >
                  {formatCurrency(activityDiffYtd)}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatDaysToPay(report.ytdAvgDaysToPay)}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatDaysToPay(report.ytdAvgDaysToApprove)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <BillingBreakdownTable
          title="By Project"
          year={year}
          rows={projectRows.map((p) => ({ ...p, groupId: p.projectId, groupName: p.projectName }))}
          hrefFor={(id) => `/projects/${id}`}
          emptyLabel={`No billing activity for ${year}.`}
        />

        <BillingBreakdownTable
          title="By Developer"
          year={year}
          rows={developerRows}
          emptyLabel={`No billing activity for ${year}.`}
        />

        <BillingBreakdownTable
          title="By Lender"
          year={year}
          rows={lenderRows}
          emptyLabel={`No billing activity for ${year}.`}
        />
      </main>
    </div>
  );
}
