import SiteHeader from "@/components/SiteHeader";
import { averageDaysOutstanding, getBillingReport, getDashboardData, getOpenDraws } from "@/lib/data";
import { businessToday } from "@/lib/format";
import PortfolioDashboard from "@/components/PortfolioDashboard";
import OpenDrawsSection from "@/components/OpenDrawsSection";
import AddProjectModal from "@/components/AddProjectModal";
import AddDrawModal from "@/components/AddDrawModal";
import AgingAlertBanner from "@/components/AgingAlertBanner";
import DrawsDueAlertBanner from "@/components/DrawsDueAlertBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage(
  props: {
    searchParams: Promise<{ aging?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const currentYear = businessToday().getFullYear();
  const [{ rollups, residuals }, openDraws, billingYtd] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
    getBillingReport(currentYear),
  ]);

  const avgDaysOutstanding = averageDaysOutstanding(openDraws);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
          <div className="flex gap-2">
            <AddDrawModal projects={rollups.map((r) => r.project)} />
            <AddProjectModal />
          </div>
        </div>
        <p className="text-sm text-foreground mb-6">
          Money owed covers every project. The portfolio summary and table follow the Active / All view.
        </p>

        <DrawsDueAlertBanner rollups={rollups} />
        <AgingAlertBanner draws={openDraws} />

        <PortfolioDashboard
          rollups={rollups}
          residuals={residuals}
          openDraws={openDraws.map((d) => ({ status: d.status, projectStatus: d.project.status }))}
          ytd={{ year: currentYear, billed: billingYtd.ytdRequested, received: billingYtd.ytdReceived }}
          avgDaysOutstanding={avgDaysOutstanding}
          openDrawsSlot={<OpenDrawsSection draws={openDraws} initialAging={searchParams.aging} />}
        />
      </main>
    </div>
  );
}
