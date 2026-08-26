import SiteHeader from "@/components/SiteHeader";
import { getDashboardData, getOpenDraws } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import DashboardTable from "@/components/DashboardTable";
import OpenDrawsSection from "@/components/OpenDrawsSection";
import AddProjectModal from "@/components/AddProjectModal";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ rollups, totals }, openDraws] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          <AddProjectModal />
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Owner draws and subcontractor invoicing across all active projects.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Currently invoiced (awaiting payment)
            </p>
            <p className="text-2xl font-semibold text-red-500 mt-1">
              {formatCurrency(totals.totalOpenToOwner)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Total paid to date
            </p>
            <p className="text-2xl font-semibold text-emerald-700 mt-1">
              {formatCurrency(totals.totalPaidToOwner)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="rounded-lg bg-slate-100/60 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Total sub invoices outstanding
            </p>
            <p className="text-lg font-medium text-slate-600 mt-1">
              {formatCurrency(totals.totalOutstanding)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100/60 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Total retainage held
            </p>
            <p className="text-lg font-medium text-slate-600 mt-1">
              {formatCurrency(totals.totalRetainage)}
            </p>
          </div>
        </div>

        <OpenDrawsSection draws={openDraws} />

        <DashboardTable rollups={rollups} />
      </main>
    </div>
  );
}
