import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BudgetLine, DrawLineAllocation, OpenDraw, OwnerDraw, Project, ProjectRollup } from "@/lib/types";

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

export async function getAllocationsForProject(projectId: string): Promise<DrawLineAllocation[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_draw_line_allocations")
    .select("*, inv_owner_draws!inner(project_id)")
    .eq("inv_owner_draws.project_id", projectId);
  if (error) throw error;
  return (data as (DrawLineAllocation & { inv_owner_draws: unknown })[]).map((row) => ({
    id: row.id,
    draw_id: row.draw_id,
    budget_line_id: row.budget_line_id,
    amount: row.amount,
    created_at: row.created_at,
  }));
}

export async function getAllocationsForDraw(drawId: string): Promise<DrawLineAllocation[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_draw_line_allocations")
    .select("*")
    .eq("draw_id", drawId);
  if (error) throw error;
  return data as DrawLineAllocation[];
}

export async function getAllDraws(): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("inv_owner_draws").select("*");
  if (error) throw error;
  return data as OwnerDraw[];
}

export async function getAllBudgetLines(): Promise<BudgetLine[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("inv_project_budget_lines").select("*");
  if (error) throw error;
  return data as BudgetLine[];
}

// A draw's outstanding balance: what's been billed but not yet actually
// received, regardless of status. Catches a draw marked "paid" for less
// than it requested — the shortfall stays open rather than disappearing.
export function openBalance(d: OwnerDraw): number {
  if (d.status === "draft") return 0;
  return Math.max(0, (d.amount_requested ?? 0) - (d.amount_paid ?? 0));
}

export async function getOpenDraws(): Promise<OpenDraw[]> {
  const [projects, draws] = await Promise.all([getProjects(), getAllDraws()]);

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const openDraws = draws
    .filter((d) => openBalance(d) > 0.005)
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
    totalBudget: number;
    totalRetainage: number;
  };
}> {
  const [projects, draws, budgetLines] = await Promise.all([
    getProjects(),
    getAllDraws(),
    getAllBudgetLines(),
  ]);

  const rollups: ProjectRollup[] = projects.map((project) => {
    const projectDraws = draws.filter((d) => d.project_id === project.id);
    const projectBudgetLines = budgetLines.filter((l) => l.project_id === project.id);

    const totalRequested = sum(projectDraws.map((d) => d.amount_requested));
    const totalApproved = sum(projectDraws.map((d) => d.amount_approved));
    const totalDrawRetainage = sum(projectDraws.map((d) => d.retainage_held));

    const totalPaidToOwner = sum(
      projectDraws.filter((d) => d.status !== "draft").map((d) => d.amount_paid)
    );
    const totalOpenToOwner = sum(projectDraws.map(openBalance));

    const totalBudget = sum(projectBudgetLines.map((l) => l.scheduled_value));
    const balanceToComplete = totalBudget - totalPaidToOwner - totalOpenToOwner;

    return {
      project,
      totalRequested,
      totalApproved,
      totalDrawRetainage,
      totalPaidToOwner,
      totalOpenToOwner,
      totalBudget,
      balanceToComplete,
    };
  });

  const totalPaidToOwner = sum(rollups.map((r) => r.totalPaidToOwner));
  const totalOpenToOwner = sum(rollups.map((r) => r.totalOpenToOwner));
  const totalBudget = sum(rollups.map((r) => r.totalBudget));
  const totalRetainage = sum(rollups.map((r) => r.totalDrawRetainage));

  return { rollups, totals: { totalPaidToOwner, totalOpenToOwner, totalBudget, totalRetainage } };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}
