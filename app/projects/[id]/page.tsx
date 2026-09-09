import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import DrawsSection from "@/components/DrawsSection";
import BudgetSection from "@/components/BudgetSection";
import MonthlyBillingChart from "@/components/MonthlyBillingChart";
import {
  getAllocationsForProject,
  getBudgetLinesForProject,
  getDrawsForProject,
  getProject,
  openBalance,
} from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import ProjectTabs from "@/components/ProjectTabs";
import EditProjectModal from "@/components/EditProjectModal";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";
import ProjectSummaryCard from "@/components/ProjectSummaryCard";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const project = await getProject(params.id);
  if (!project) notFound();

  const [draws, budgetLines, allocations] = await Promise.all([
    getDrawsForProject(project.id),
    getBudgetLinesForProject(project.id),
    getAllocationsForProject(project.id),
  ]);

  const tab = searchParams.tab === "budget" ? "budget" : "draws";

  const totalPaidToOwner = draws
    .filter((d) => d.status !== "draft")
    .reduce((acc, d) => acc + (d.amount_paid ?? 0), 0);
  const totalOpenToOwner = draws.reduce((acc, d) => acc + openBalance(d), 0);
  const totalBudget = budgetLines.reduce((acc, l) => acc + (l.scheduled_value ?? 0), 0);
  const totalRetainage = draws.reduce((acc, d) => acc + (d.retainage_held ?? 0), 0);
  // amount_requested/amount_paid are net of retention (the G702 "current
  // payment due"), so totalPaidToOwner + totalOpenToOwner alone understates
  // what's actually been billed against the contract by the retainage held —
  // subtract it too so balance reflects gross work billed, not just net.
  const balanceToComplete = totalBudget - totalPaidToOwner - totalOpenToOwner - totalRetainage;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All projects
        </Link>

        <div className="mt-2 mb-6 flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {project.address ?? "—"}
              {project.lender ? ` · Lender: ${project.lender}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProjectStatusSelect projectId={project.id} status={project.status} />
            <EditProjectModal project={project} />
          </div>
        </div>

        {/* Hero total — same ledger treatment as the dashboard: the one
            number this page exists to answer, not another card in a shelf. */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Currently invoiced — open
        </p>
        <p className="text-4xl sm:text-5xl font-semibold text-invoiced tracking-tight">
          {formatCurrency(totalOpenToOwner)}
        </p>
        <div className="border-t border-foreground/70 border-b-[3px] border-b-foreground mt-3 mb-6" />

        <div className="border-t border-border mb-6">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-2">
            Contract totals
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-border">
            <div className="py-3">
              <p className="text-xs text-muted-foreground mb-1">Paid to date</p>
              <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalPaidToOwner)}
              </p>
            </div>
            <div className="py-3 sm:pl-4 sm:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Contract value</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(totalBudget)}
              </p>
            </div>
            <div className="py-3 sm:pl-4 sm:border-l border-border">
              <p className="text-xs text-muted-foreground mb-1">Balance to complete</p>
              <p className="text-xl font-semibold text-foreground">
                {formatCurrency(balanceToComplete)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatCurrency(totalRetainage)} retainage to date
              </p>
            </div>
          </div>
        </div>

        <MonthlyBillingChart draws={draws} />

        <ProjectSummaryCard draws={draws} />

        <ProjectTabs projectId={project.id} active={tab} />

        <div className="mt-4">
          {tab === "draws" && (
            <DrawsSection
              projectId={project.id}
              draws={draws}
              budgetLines={budgetLines}
              allocations={allocations}
            />
          )}
          {tab === "budget" && (
            <BudgetSection
              projectId={project.id}
              budgetLines={budgetLines}
              allocations={allocations}
            />
          )}
        </div>
      </main>
    </div>
  );
}
