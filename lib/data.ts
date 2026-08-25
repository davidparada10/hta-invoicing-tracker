import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OwnerDraw, Project, ProjectRollup, SubInvoice } from "@/lib/types";

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

export async function getDashboardData(): Promise<{
  rollups: ProjectRollup[];
  totals: {
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

    const totalSubInvoiced = sum(projectSubInvoices.map((s) => s.amount));
    const totalSubPaid = sum(projectSubInvoices.map((s) => s.amount_paid));
    const totalSubRetainage = sum(projectSubInvoices.map((s) => s.retainage_held));

    return {
      project,
      totalRequested,
      totalApproved,
      totalDrawRetainage,
      totalSubInvoiced,
      totalSubPaid,
      totalSubOutstanding: totalSubInvoiced - totalSubPaid,
      totalSubRetainage,
    };
  });

  const totalOutstanding = sum(rollups.map((r) => r.totalSubOutstanding));
  const totalRetainage = sum(rollups.map((r) => r.totalDrawRetainage + r.totalSubRetainage));

  return { rollups, totals: { totalOutstanding, totalRetainage } };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}
