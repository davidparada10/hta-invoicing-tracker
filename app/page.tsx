import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getBillingReport, getDashboardData, getOpenDraws } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import DashboardTable from "@/components/DashboardTable";
import OpenDrawsSection from "@/components/OpenDrawsSection";
import AddProjectModal from "@/components/AddProjectModal";
import AgingAlertBanner from "@/components/AgingAlertBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const [{ rollups, totals }, openDraws, billingYtd] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
    getBillingReport(currentYear),
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
          Owner draws across all active projects.
        </p>

        <AgingAlertBanner draws={openDraws} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Currently invoiced (awaiting payment)
            </p>
            <p className="text-2xl font-semibold text-red-500 mt-1">
              {formatCurrency(totals.totalOpenToOwner)}
            </p>
          </div>
          <Link
            href="/billing"
            className="rounded-xl border border-slate-200 bg-white p-5 hover:bg-slate-50"
          >
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Billed YTD ({currentYear})
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(billingYtd.ytdRequested)}
            </p>
          </Link>
          <Link
            href="/billing"
            className="rounded-xl border border-slate-200 bg-white p-5 hover:bg-slate-50"
          >
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Payments Received YTD ({currentYear})
            </p>
            <p className="text-2xl font-semibold text-emerald-700 mt-1">
              {formatCurrency(billingYtd.ytdReceived)}
            </p>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg bg-slate-100/60 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Total contract value
            </p>
            <p className="text-lg font-medium text-slate-600 mt-1">
              {formatCurrency(totals.totalBudget)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100/60 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Total paid to date
            </p>
            <p className="text-lg font-medium text-slate-600 mt-1">
              {formatCurrency(totals.totalPaidToOwner)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100/60 p-4 min-h-[80px]" aria-hidden="true" />
          <div className="rounded-lg bg-slate-100/60 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Active projects
            </p>
            <p className="text-lg font-medium text-slate-600 mt-1">
              {rollups.filter((r) => r.project.status === "active").length}
            </p>
          </div>
        </div>

        <OpenDrawsSection draws={openDraws} />

        <DashboardTable rollups={rollups} />
      </main>
    </div>
  );
}
