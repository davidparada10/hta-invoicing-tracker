import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BudgetLine, OpenDraw, OwnerDraw, Project, ProjectRollup, SubInvoice } from "@/lib/types";

export async function getProjects(): Promise<Project[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_projects")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

export async function getDrawsForProject(projectId: string): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_owner_draws")
    .select("*")
    .eq("project_id", projectId)
    .order("draw_number", { ascending: true });
  if (error) throw error;
  return data as OwnerDraw[];
}

export async function getSubInvoicesForProject(projectId: string): Promise<SubInvoice[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_sub_invoices")
    .select("*")
    .eq("project_id", projectId)
    .order("invoice_date", { ascending: false });
  if (error) throw error;
  return data as SubInvoice[];
}

export async function getBudgetLinesForProject(projectId: string): Promise<BudgetLine[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_project_budget_lines")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as BudgetLine[];
}

export async function getAllDraws(): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("inv_owner_draws").select("*");
  if (error) throw error;
  return data as OwnerDraw[];
}

export async function getAllSubInvoices(): Promise<SubInvoice[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("inv_sub_invoices").select("*");
  if (error) throw error;
  return data as SubInvoice[];
}

export async function getOpenDraws(): Promise<OpenDraw[]> {
  const [projects, draws] = await Promise.all([getProjects(), getAllDraws()]);

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const openDraws = draws
    .filter((d) => d.status === "submitted" || d.status === "approved")
    .map((d) => {
      const project = projectsById.get(d.project_id);
      return {
        ...d,
        project: { id: project?.id ?? d.project_id, name: project?.name ?? "Unknown project" },
      };
    });

  openDraws.sort((a, b) => {
    const aDate = a.date_submitted ?? a.created_at;
    const bDate = b.date_submitted ?? b.created_at;
    return aDate.localeCompare(bDate);
  });

  return openDraws;
}

export async function getDashboardData(): Promise<{
  rollups: ProjectRollup[];
  totals: {
    totalPaidToOwner: number;
    totalOpenToOwner: number;
    totalOutstanding: number;
    totalRetainage: number;
  };
}> {
  const [projects, draws, subInvoices] = await Promise.all([
    getProjects(),
    getAllDraws(),
    getAllSubInvoices(),
  ]);

  const rollups: ProjectRollup[] = projects.map((project) => {
    const projectDraws = draws.filter((d) => d.project_id === project.id);
    const projectSubInvoices = subInvoices.filter((s) => s.project_id === project.id);

    const totalRequested = sum(projectDraws.map((d) => d.amount_requested));
    const totalApproved = sum(projectDraws.map((d) => d.amount_approved));
    const totalDrawRetainage = sum(projectDraws.map((d) => d.retainage_held));

    const totalPaidToOwner = sum(
      projectDraws.filter((d) => d.status === "paid").map((d) => d.amount_paid)
    );
    const totalOpenToOwner = sum(
      projectDraws
        .filter((d) => d.status === "submitted" || d.status === "approved")
        .map((d) => d.amount_requested)
    );

    const totalSubInvoiced = sum(projectSubInvoices.map((s) => s.amount));
    const totalSubPaid = sum(projectSubInvoices.map((s) => s.amount_paid));
    const totalSubRetainage = sum(projectSubInvoices.map((s) => s.retainage_held));

    return {
      project,
      totalRequested,
      totalApproved,
      totalDrawRetainage,
      totalPaidToOwner,
      totalOpenToOwner,
      totalSubInvoiced,
      totalSubPaid,
      totalSubOutstanding: totalSubInvoiced - totalSubPaid,
      totalSubRetainage,
    };
  });

  const totalPaidToOwner = sum(rollups.map((r) => r.totalPaidToOwner));
  const totalOpenToOwner = sum(rollups.map((r) => r.totalOpenToOwner));
  const totalOutstanding = sum(rollups.map((r) => r.totalSubOutstanding));
  const totalRetainage = sum(rollups.map((r) => r.totalDrawRetainage + r.totalSubRetainage));

  return { rollups, totals: { totalPaidToOwner, totalOpenToOwner, totalOutstanding, totalRetainage } };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}
