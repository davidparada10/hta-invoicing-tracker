import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import DrawsSection from "@/components/DrawsSection";
import SubInvoicesSection from "@/components/SubInvoicesSection";
import { getDrawsForProject, getProject, getSubInvoicesForProject } from "@/lib/data";
import ProjectTabs from "@/components/ProjectTabs";
import EditProjectModal from "@/components/EditProjectModal";
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

  const [draws, subInvoices] = await Promise.all([
    getDrawsForProject(project.id),
    getSubInvoicesForProject(project.id),
  ]);

  const tab = searchParams.tab === "invoices" ? "invoices" : "draws";

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
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                project.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {project.status}
            </span>
            <EditProjectModal project={project} />
          </div>
        </div>

        <ProjectSummaryCard draws={draws} subInvoices={subInvoices} />

        <ProjectTabs projectId={project.id} active={tab} />

        <div className="mt-4">
          {tab === "draws" ? (
            <DrawsSection projectId={project.id} draws={draws} />
          ) : (
            <SubInvoicesSection projectId={project.id} invoices={subInvoices} />
          )}
        </div>
      </main>
    </div>
  );
}
