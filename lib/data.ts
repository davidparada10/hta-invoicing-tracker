import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BudgetLine, DrawLineAllocation, OpenDraw, OwnerDraw, Project, ProjectRollup } from "@/lib/types";
import { BillingReport, ProjectBillingRow, buildBillingReport, buildProjectBillingBreakdown } from "@/lib/billing";
import { drawDueLabel, isDrawOverdue, isDrawUrgent } from "@/lib/drawSchedule";
import { MIN_MEANINGFUL_OPEN_BALANCE } from "@/lib/aging";

export { MIN_MEANINGFUL_OPEN_BALANCE };

// Supabase's PostgREST API silently caps a plain select() at 1000 rows with
// no error — inv_project_budget_lines alone passed that as soon as ~10
// projects each had a full schedule of values, which made the most
// recently-created project's budget quietly vanish from every dashboard
// total. Page through in fixed-size chunks so "all rows" actually means all
// rows, ordered by id for a stable cursor across pages.
async function fetchAllRows<T>(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  table: string,
  selectClause: string = "*",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configure?: (query: any) => any
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(selectClause).order("id", { ascending: true });
    if (configure) query = configure(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

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
  if (error) {
    // A malformed id (e.g. a stale link or a typo) isn't a valid uuid, which
    // Postgres rejects as error 22P02 rather than just finding no rows —
    // treat it the same as "not found" instead of crashing the page.
    if (error.code === "22P02") return null;
    throw error;
  }
  return data as Project | null;
}

export async function getDrawsForProject(projectId: string): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_owner_draws")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("draw_number", { ascending: true });
  if (error) throw error;
  return data as OwnerDraw[];
}

export async function getDeletedDrawsForProject(projectId: string): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_owner_draws")
    .select("*")
    .eq("project_id", projectId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data as OwnerDraw[];
}

export async function getBudgetLinesForProject(projectId: string): Promise<BudgetLine[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_project_budget_lines")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as BudgetLine[];
}

export async function getDeletedBudgetLinesForProject(projectId: string): Promise<BudgetLine[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inv_project_budget_lines")
    .select("*")
    .eq("project_id", projectId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data as BudgetLine[];
}

export async function getAllocationsForProject(projectId: string): Promise<DrawLineAllocation[]> {
  const supabase = createServerSupabaseClient();
  const [rows, liveDraws, liveBudgetLines] = await Promise.all([
    fetchAllRows<DrawLineAllocation & { inv_owner_draws: unknown }>(
      supabase,
      "inv_draw_line_allocations",
      "*, inv_owner_draws!inner(project_id)",
      (query) => query.eq("inv_owner_draws.project_id", projectId)
    ),
    getDrawsForProject(projectId),
    getBudgetLinesForProject(projectId),
  ]);

  // A soft-deleted draw or budget line's old allocations shouldn't keep
  // counting toward "Drawn to Date" once it's hidden from the live tables —
  // filter here, the one place every caller (dashboard totals included)
  // reads allocations from, rather than relying on each consumer to remember.
  const liveDrawIds = new Set(liveDraws.map((d) => d.id));
  const liveBudgetLineIds = new Set(liveBudgetLines.map((l) => l.id));

  return rows
    .filter((row) => liveDrawIds.has(row.draw_id) && liveBudgetLineIds.has(row.budget_line_id))
    .map((row) => ({
      id: row.id,
      draw_id: row.draw_id,
      budget_line_id: row.budget_line_id,
      amount: row.amount,
      created_at: row.created_at,
    }));
}

export async function getAllocationsForDraw(drawId: string): Promise<DrawLineAllocation[]> {
  const supabase = createServerSupabaseClient();
  return fetchAllRows<DrawLineAllocation>(supabase, "inv_draw_line_allocations", "*", (query) =>
    query.eq("draw_id", drawId)
  );
}

export async function getAllDraws(): Promise<OwnerDraw[]> {
  const supabase = createServerSupabaseClient();
  return fetchAllRows<OwnerDraw>(supabase, "inv_owner_draws", "*", (query) =>
    query.is("deleted_at", null)
  );
}

export async function getAllBudgetLines(): Promise<BudgetLine[]> {
  const supabase = createServerSupabaseClient();
  return fetchAllRows<BudgetLine>(supabase, "inv_project_budget_lines", "*", (query) =>
    query.is("deleted_at", null)
  );
}

export async function getBillingReport(year: number): Promise<BillingReport> {
  const [draws, excludedMap] = await Promise.all([getAllDraws(), getPortfolioExcludedMap()]);
  return buildBillingReport(withExcludedAllocated(draws, excludedMap), year);
}

export async function getProjectBillingBreakdown(year: number): Promise<ProjectBillingRow[]> {
  const [draws, projects, excludedMap] = await Promise.all([
    getAllDraws(),
    getProjects(),
    getPortfolioExcludedMap(),
  ]);
  return buildProjectBillingBreakdown(withExcludedAllocated(draws, excludedMap), projects, year);
}

// A draw's outstanding balance: what's been billed but not yet actually
// received, regardless of status. Catches a draw marked "paid" for less
// than it requested — the shortfall stays open rather than disappearing.
// Nets out excluded_allocated (when the draw is decorated with it) so a
// gap caused by owner-paid, non-HTA scope doesn't read as money HTA is
// still owed.
export function openBalance(d: OwnerDraw): number {
  if (d.status === "draft") return 0;
  return Math.max(0, (d.amount_requested ?? 0) - (d.excluded_allocated ?? 0) - (d.amount_paid ?? 0));
}

// A summed open balance can be pure noise — several draws each under
// MIN_MEANINGFUL_OPEN_BALANCE adding up above it. This checks the draws
// themselves rather than the sum, so UI can tell "several small fees" from
// "one real balance" and only alarm-color the latter.
export function hasMeaningfulOpenBalance(draws: OwnerDraw[]): boolean {
  return draws.some((d) => openBalance(d) > MIN_MEANINGFUL_OPEN_BALANCE);
}

// Sums each draw's allocations against excluded_from_contract budget
// lines, keyed by draw_id — the amount of that draw's billing that was for
// owner-paid scope, not HTA's. Used to decorate draws before computing
// openBalance so that portion stops reading as outstanding.
export function excludedAllocationByDraw(
  allocations: { draw_id: string; budget_line_id: string; amount: number }[],
  budgetLines: BudgetLine[]
): Map<string, number> {
  const excludedLineIds = new Set(
    budgetLines.filter((l) => l.excluded_from_contract).map((l) => l.id)
  );
  const map = new Map<string, number>();
  for (const a of allocations) {
    if (!excludedLineIds.has(a.budget_line_id)) continue;
    map.set(a.draw_id, (map.get(a.draw_id) ?? 0) + a.amount);
  }
  return map;
}

function withExcludedAllocated(draws: OwnerDraw[], excludedMap: Map<string, number>): OwnerDraw[] {
  return draws.map((d) => ({ ...d, excluded_allocated: excludedMap.get(d.id) ?? 0 }));
}

// Single-draw version of excludedAllocationByDraw's inputs, for the
// payment/status write paths (markDrawPaid, updateDrawStatus, and their AI
// equivalents) that only ever touch one draw at a time and don't already
// have the project's full budget lines + allocations in scope.
export async function getExcludedAllocatedForDraw(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  drawId: string,
  projectId: string
): Promise<number> {
  const [budgetLines, allocationRows] = await Promise.all([
    fetchAllRows<BudgetLine>(supabase, "inv_project_budget_lines", "*", (q) =>
      q.eq("project_id", projectId).is("deleted_at", null)
    ),
    fetchAllRows<{ draw_id: string; budget_line_id: string; amount: number }>(
      supabase,
      "inv_draw_line_allocations",
      "draw_id, budget_line_id, amount",
      (q) => q.eq("draw_id", drawId)
    ),
  ]);
  return excludedAllocationByDraw(allocationRows, budgetLines).get(drawId) ?? 0;
}

// The actual cash still collectible by HTA on a draw — requested minus
// owner-paid scope minus what's already been paid, floored at zero. This
// is openBalance() for a single draw the caller doesn't already have
// excluded_allocated decoration for (the write paths select their own
// narrow column set, not the full decorated OwnerDraw the read paths use).
export async function remainingBalanceForDraw(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  draw: Pick<OwnerDraw, "id" | "project_id" | "status" | "amount_requested" | "amount_paid">
): Promise<{ excludedAllocated: number; remaining: number }> {
  const excludedAllocated = await getExcludedAllocatedForDraw(supabase, draw.id, draw.project_id);
  const remaining = openBalance({ ...draw, excluded_allocated: excludedAllocated } as OwnerDraw);
  return { excludedAllocated, remaining };
}

// The single source of truth for "is this draw safe to look up and
// mutate": excludes soft-deleted rows so an ordinary edit or an AI action
// can never silently touch something sitting in the Trash, or (via an
// update that doesn't itself check deleted_at) un-delete it as a side
// effect. Matches by id, or by project + draw number for the AI tools,
// which resolve a project by name rather than by id and shouldn't be able
// to reach across into a different project's draw.
export async function getLiveDraw(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  match: { id: string } | { projectId: string; drawNumber: number }
): Promise<OwnerDraw | null> {
  let query = supabase.from("inv_owner_draws").select("*").is("deleted_at", null);
  query =
    "id" in match
      ? query.eq("id", match.id)
      : query.eq("project_id", match.projectId).eq("draw_number", match.drawNumber);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as OwnerDraw | null;
}

// A Schedule of Values sometimes carries owner-paid items (architect fees,
// permit/plan-check fees) alongside HTA's own scope, uploaded as one sheet —
// those lines are flagged excluded_from_contract so every "Contract Value"
// total (dashboard, project detail, Schedule of Values tab) reflects only
// what HTA is actually contracted for, while the excluded lines stay visible
// in the Schedule of Values for reference.
export function contractValue(lines: BudgetLine[]): number {
  return lines
    .filter((l) => !l.excluded_from_contract)
    .reduce((acc, l) => acc + (l.scheduled_value ?? 0), 0);
}

// Portfolio-wide version of excludedAllocationByDraw's inputs — fetched
// together wherever draws need excluded_allocated decoration but the caller
// doesn't already have budget lines + allocations in scope for a single
// project (see app/projects/[id]/page.tsx, which computes its own from data
// it already fetched).
async function getPortfolioExcludedMap(): Promise<Map<string, number>> {
  const [budgetLines, allocationRows] = await Promise.all([
    getAllBudgetLines(),
    fetchAllRows<{ draw_id: string; budget_line_id: string; amount: number }>(
      createServerSupabaseClient(),
      "inv_draw_line_allocations",
      "draw_id, budget_line_id, amount"
    ),
  ]);
  return excludedAllocationByDraw(allocationRows, budgetLines);
}

export async function getOpenDraws(): Promise<OpenDraw[]> {
  const [projects, draws, excludedMap] = await Promise.all([
    getProjects(),
    getAllDraws(),
    getPortfolioExcludedMap(),
  ]);

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const openDraws = withExcludedAllocated(draws, excludedMap)
    // Drafts have no real outstanding balance yet (nothing's been billed),
    // but are included so they're reachable for a quick status change
    // without opening the project — excluded from the $ totals/aging
    // summary in OpenDrawsSection, which filter them back out.
    .filter((d) => d.status === "draft" || openBalance(d) > MIN_MEANINGFUL_OPEN_BALANCE)
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
    totalDraft: number;
  };
}> {
  const [projects, draws, budgetLines, allocationRows] = await Promise.all([
    getProjects(),
    getAllDraws(),
    getAllBudgetLines(),
    fetchAllRows<{ draw_id: string; budget_line_id: string; amount: number }>(
      createServerSupabaseClient(),
      "inv_draw_line_allocations",
      "draw_id, budget_line_id, amount"
    ),
  ]);
  const excludedMap = excludedAllocationByDraw(allocationRows, budgetLines);

  const now = new Date();
  const rollups: ProjectRollup[] = projects.map((project) => {
    const projectDraws = withExcludedAllocated(
      draws.filter((d) => d.project_id === project.id),
      excludedMap
    );
    const projectBudgetLines = budgetLines.filter((l) => l.project_id === project.id);

    const totalRequested = sum(projectDraws.map((d) => d.amount_requested));
    const totalApproved = sum(projectDraws.map((d) => d.amount_approved));
    // A draft hasn't actually been submitted or certified yet, so nothing's
    // really been withheld from it — preparing or editing a draft must not
    // move posted retainage or reduce Balance to complete.
    const totalDrawRetainage = sum(
      projectDraws.filter((d) => d.status !== "draft").map((d) => d.retainage_held)
    );

    const totalPaidToOwner = sum(
      projectDraws.filter((d) => d.status !== "draft").map((d) => d.amount_paid)
    );
    const totalOpenToOwner = sum(projectDraws.map(openBalance));
    const meaningfulOpenBalance = hasMeaningfulOpenBalance(projectDraws);
    const totalDraft = sum(
      projectDraws.filter((d) => d.status === "draft").map((d) => d.amount_requested)
    );

    const totalBudget = contractValue(projectBudgetLines);
    // amount_requested/amount_paid are net of retention (the G702 "current
    // payment due"), so totalPaidToOwner + totalOpenToOwner alone understates
    // what's actually been billed against the contract by the retainage
    // held — subtract it too so balance reflects gross work billed, not
    // just net.
    const balanceToComplete = totalBudget - totalPaidToOwner - totalOpenToOwner - totalDrawRetainage;

    return {
      project,
      totalRequested,
      totalApproved,
      totalDrawRetainage,
      totalPaidToOwner,
      totalOpenToOwner,
      hasMeaningfulOpenBalance: meaningfulOpenBalance,
      totalDraft,
      totalBudget,
      balanceToComplete,
      // A closed project shouldn't keep nagging about a cadence set while it
      // was still active — no more draws are expected from it.
      isDrawOverdue: project.status === "active" && isDrawOverdue(project, projectDraws, now),
      isDrawUrgent: project.status === "active" && isDrawUrgent(project, projectDraws, now),
      nextDrawLabel: project.status === "active" ? drawDueLabel(project, now) : null,
    };
  });

  const totalPaidToOwner = sum(rollups.map((r) => r.totalPaidToOwner));
  const totalOpenToOwner = sum(rollups.map((r) => r.totalOpenToOwner));
  const totalBudget = sum(rollups.map((r) => r.totalBudget));
  const totalRetainage = sum(rollups.map((r) => r.totalDrawRetainage));
  const totalDraft = sum(rollups.map((r) => r.totalDraft));

  return {
    rollups,
    totals: { totalPaidToOwner, totalOpenToOwner, totalBudget, totalRetainage, totalDraft },
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}
