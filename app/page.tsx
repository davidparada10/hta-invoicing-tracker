import SiteHeader from "@/components/SiteHeader";
import { getDashboardData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import DashboardTable from "@/components/DashboardTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { rollups, totals } = await getDashboardData();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Projects</h1>
        <p className="text-sm text-slate-500 mb-6">
          Owner draws and subcontractor invoicing across all active projects.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Total sub invoices outstanding
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(totals.totalOutstanding)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Total retainage held
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(totals.totalRetainage)}
            </p>
          </div>
        </div>

        <DashboardTable rollups={rollups} />
      </main>
    </div>
  );
}
