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

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
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
  const balanceToComplete = totalBudget - totalPaidToOwner - totalOpenToOwner;
  const totalRetainage = draws.reduce((acc, d) => acc + (d.retainage_held ?? 0), 0);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← All projects
        </Link>

        <div className="mt-2 mb-6 flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {project.address ?? "—"}
              {project.lender ? ` · Lender: ${project.lender}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProjectStatusSelect projectId={project.id} status={project.status} />
            <EditProjectModal project={project} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Currently Invoiced (Open)
            </p>
            <p className="text-2xl font-semibold text-invoiced mt-1">
              {formatCurrency(totalOpenToOwner)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Total Paid to Date
            </p>
            <p className="text-2xl font-semibold text-emerald-700 mt-1">
              {formatCurrency(totalPaidToOwner)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Contract Value
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(totalBudget)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Balance to Complete
            </p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(balanceToComplete)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatCurrency(totalRetainage)} retainage to date
            </p>
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
