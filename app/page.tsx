import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getBillingReport, getDashboardData, getOpenDraws } from "@/lib/data";
import { daysOpen } from "@/lib/aging";
import { formatCurrency } from "@/lib/format";
import DashboardTable from "@/components/DashboardTable";
import OpenDrawsSection from "@/components/OpenDrawsSection";
import AddProjectModal from "@/components/AddProjectModal";
import AgingAlertBanner from "@/components/AgingAlertBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { aging?: string };
}) {
  const currentYear = new Date().getFullYear();
  const [{ rollups, totals }, openDraws, billingYtd] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
    getBillingReport(currentYear),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
          <AddProjectModal />
        </div>
        <p className="text-sm text-foreground mb-6">
          Draws across all active projects.
        </p>

        <AgingAlertBanner draws={openDraws} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Currently invoiced (awaiting payment)
            </p>
            <p className="text-2xl font-semibold text-invoiced mt-1">
              {formatCurrency(totals.totalOpenToOwner)}
            </p>
          </div>
          <Link
            href="/billing"
            className="rounded-xl border border-border bg-card p-5 hover:bg-muted"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Billed YTD ({currentYear})
            </p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {formatCurrency(billingYtd.ytdRequested)}
            </p>
          </Link>
          <Link
            href="/billing"
            className="rounded-xl border border-border bg-card p-5 hover:bg-muted"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Payments Received YTD ({currentYear})
            </p>
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(billingYtd.ytdReceived)}
            </p>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total contract value
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {formatCurrency(totals.totalBudget)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total paid to date
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {formatCurrency(totals.totalPaidToOwner)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Balance to complete
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {formatCurrency(
                totals.totalBudget -
                  totals.totalPaidToOwner -
                  totals.totalOpenToOwner -
                  totals.totalRetainage
              )}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active projects
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {rollups.filter((r) => r.project.status === "active").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              % billed of contract
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {totals.totalBudget > 0
                ? `${(
                    ((totals.totalPaidToOwner + totals.totalOpenToOwner + totals.totalRetainage) /
                      totals.totalBudget) *
                    100
                  ).toFixed(0)}%`
                : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Avg days outstanding
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {openDraws.length > 0
                ? `${Math.round(
                    openDraws.reduce(
                      (acc, d) => acc + daysOpen(d.date_submitted ?? d.created_at),
                      0
                    ) / openDraws.length
                  )} days`
                : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total retainage held
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {formatCurrency(totals.totalRetainage)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Open draws
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {openDraws.filter((d) => d.status !== "draft").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Draft invoices total
            </p>
            <p className="text-lg font-semibold text-foreground mt-1">
              {formatCurrency(totals.totalDraft)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Coming soon
            </p>
            <p className="text-lg font-semibold text-muted-foreground mt-1">—</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Coming soon
            </p>
            <p className="text-lg font-semibold text-muted-foreground mt-1">—</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Coming soon
            </p>
            <p className="text-lg font-semibold text-muted-foreground mt-1">—</p>
          </div>
        </div>

        <OpenDrawsSection draws={openDraws} initialAging={searchParams.aging} />

        <DashboardTable rollups={rollups} />
      </main>
    </div>
  );
}
