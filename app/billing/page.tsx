import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getBillingReport, getProjectBillingBreakdown } from "@/lib/data";
import { currentQuarter } from "@/lib/billing";
import { formatCurrency } from "@/lib/format";

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
          <h1 className="text-2xl font-semibold text-slate-900">Billing Summary</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/billing?year=${year - 1}`} className="text-slate-500 hover:text-slate-900">
              ← {year - 1}
            </Link>
            <span className="font-medium text-slate-900">{year}</span>
            {year < thisYear ? (
              <Link href={`/billing?year=${year + 1}`} className="text-slate-500 hover:text-slate-900">
                {year + 1} →
              </Link>
            ) : (
              <span className="text-slate-300">{year + 1} →</span>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Amounts billed (submitted) vs. actually received (paid), by quarter, across all
          projects. Billed and received can land in different quarters — this is cash-basis, not
          accrual.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Billed {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(report.ytdRequested)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Received {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-emerald-700 mt-1">
              {formatCurrency(report.ytdReceived)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Outstanding {isCurrentYear ? "YTD" : year}
            </p>
            <p className="text-2xl font-semibold text-red-500 mt-1">
              {formatCurrency(outstandingYtd)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-slate-50">Quarter</th>
                <th className="text-right px-4 py-2">Billed</th>
                <th className="text-right px-4 py-2">Received</th>
                <th className="text-right px-4 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.quarters.map((q) => {
                const isActive = q.quarter === activeQuarter;
                return (
                  <tr key={q.quarter} className={isActive ? "bg-amber-50" : ""}>
                    <td
                      className={`px-4 py-2 font-medium text-slate-900 sticky left-0 z-10 ${
                        isActive ? "bg-amber-50" : "bg-white"
                      }`}
                    >
                      {QUARTER_LABEL[q.quarter]}
                      {isActive && (
                        <span className="ml-2 text-xs font-normal text-amber-700">
                          (quarter to date)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(q.requested)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">
                      {formatCurrency(q.received)}
                    </td>
                    <td className="px-4 py-2 text-right text-red-600">
                      {formatCurrency(q.requested - q.received)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold text-slate-900">
                <td className="px-4 py-2 sticky left-0 z-10 bg-white">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(report.ytdRequested)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">
                  {formatCurrency(report.ytdReceived)}
                </td>
                <td className="px-4 py-2 text-right text-red-600">
                  {formatCurrency(outstandingYtd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">By Project ({year})</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-slate-50">Project</th>
                <th className="text-right px-4 py-2">Billed</th>
                <th className="text-right px-4 py-2">Received</th>
                <th className="text-right px-4 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectRows.map((p) => (
                <tr key={p.projectId} className="hover:bg-slate-50">
                  <td className="px-4 py-2 sticky left-0 z-10 bg-white">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {p.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(p.requested)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">
                    {formatCurrency(p.received)}
                  </td>
                  <td className="px-4 py-2 text-right text-red-600">
                    {formatCurrency(p.requested - p.received)}
                  </td>
                </tr>
              ))}
              {projectRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No billing activity for {year}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold text-slate-900">
                <td className="px-4 py-2 sticky left-0 z-10 bg-white">Total ({year})</td>
                <td className="px-4 py-2 text-right">{formatCurrency(report.ytdRequested)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">
                  {formatCurrency(report.ytdReceived)}
                </td>
                <td className="px-4 py-2 text-right text-red-600">
                  {formatCurrency(outstandingYtd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </main>
    </div>
  );
}
