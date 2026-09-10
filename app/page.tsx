import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getBillingReport, getDashboardData, getOpenDraws } from "@/lib/data";
import { daysOpen } from "@/lib/aging";
import { formatCurrency } from "@/lib/format";
import DashboardTable from "@/components/DashboardTable";
import OpenDrawsSection from "@/components/OpenDrawsSection";
import AddProjectModal from "@/components/AddProjectModal";
import AgingAlertBanner from "@/components/AgingAlertBanner";
import DrawsDueAlertBanner from "@/components/DrawsDueAlertBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage(
  props: {
    searchParams: Promise<{ aging?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const currentYear = new Date().getFullYear();
  const [{ rollups, totals }, openDraws, billingYtd] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
    getBillingReport(currentYear),
  ]);

  const activeProjectCount = rollups.filter((r) => r.project.status === "active").length;
  const openDrawsCount = openDraws.filter((d) => d.status !== "draft").length;
  const avgDaysOutstanding =
    openDraws.length > 0
      ? Math.round(
          openDraws.reduce((acc, d) => acc + daysOpen(d.date_submitted ?? d.created_at), 0) /
            openDraws.length
        )
      : null;
  const balanceToComplete =
    totals.totalBudget - totals.totalPaidToOwner - totals.totalOpenToOwner - totals.totalRetainage;
  const pctBilled =
    totals.totalBudget > 0
      ? `${(
          ((totals.totalPaidToOwner + totals.totalOpenToOwner + totals.totalRetainage) /
            totals.totalBudget) *
          100
        ).toFixed(0)}%`
      : "—";

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

        <DrawsDueAlertBanner rollups={rollups} />
        <AgingAlertBanner draws={openDraws} />

        {/* Hero total — the one number this page exists to answer, styled
            after an AIA G702 application's grand-total line (rule under
            the figure) rather than another card in a shelf of cards. */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Currently invoiced — awaiting payment
        </p>
        <p className="text-4xl sm:text-5xl font-semibold text-invoiced tracking-tight">
          {formatCurrency(totals.totalOpenToOwner)}
        </p>
        <div className="border-t border-foreground/70 border-b-[3px] border-b-foreground mt-3 mb-2" />
        <p className="text-sm text-muted-foreground mb-8">
          {openDrawsCount} open draws across {activeProjectCount} active projects
        </p>

        {/* Supporting figures — grouped by what kind of number they are
            (a G703 continuation sheet), not one undifferentiated shelf. */}
        <div className="border-t border-border mb-8">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-2">
            Year to date ({currentYear})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-border">
            <Link href="/billing" className="py-3 block hover:bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Billed</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(billingYtd.ytdRequested)}
              </p>
            </Link>
            <Link
              href="/billing"
              className="py-3 sm:pl-4 sm:border-l border-border block hover:bg-muted"
            >
              <p className="text-xs text-muted-foreground mb-1">Received</p>
              <p className="text-xl font-semibold text-paid">
                {formatCurrency(billingYtd.ytdReceived)}
              </p>
            </Link>
            <div className="py-3 sm:pl-4 sm:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Avg. days outstanding</p>
              <p className="text-xl font-semibold text-foreground">
                {avgDaysOutstanding !== null ? `${avgDaysOutstanding} days` : "—"}
              </p>
            </div>
          </div>

          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-2">
            Contract totals
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-border">
            <div className="py-3">
              <p className="text-xs text-muted-foreground mb-1">Contract value</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(totals.totalBudget)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Paid to date</p>
              <p className="text-xl font-semibold text-paid">
                {formatCurrency(totals.totalPaidToOwner)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Balance to complete</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(balanceToComplete)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">% billed of contract</p>
              <p className="text-xl font-semibold text-foreground">{pctBilled}</p>
            </div>
          </div>

          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-2">
            Status
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-border">
            <div className="py-3">
              <p className="text-xs text-muted-foreground mb-1">Active projects</p>
              <p className="text-xl font-semibold text-foreground">{activeProjectCount}</p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Open draws</p>
              <p className="text-xl font-semibold text-foreground">{openDrawsCount}</p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Retainage held</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(totals.totalRetainage)}
              </p>
            </div>
            <div className="py-3 lg:pl-4 lg:border-l border-border">
              <p
                className={`text-xs mb-1 ${
                  totals.totalDraft > 0
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground"
                }`}
              >
                Draft invoices, not yet submitted
              </p>
              <p
                className={`text-xl font-semibold ${
                  totals.totalDraft > 0
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-foreground"
                }`}
              >
                {formatCurrency(totals.totalDraft)}
              </p>
            </div>
          </div>
        </div>

        <OpenDrawsSection draws={openDraws} initialAging={searchParams.aging} />

        <DashboardTable rollups={rollups} />
      </main>
    </div>
  );
}
