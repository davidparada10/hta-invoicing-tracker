export type ProjectStatus = "active" | "closed";
export type DrawStatus = "draft" | "submitted" | "approved" | "paid";
export type DrawDueType = "day_of_month" | "last_weekday";

export interface Project {
  id: string;
  name: string;
  project_number: string;
  address: string | null;
  lender: string | null;
  status: ProjectStatus;
  created_at: string;
  // Recurring draw cadence. draw_due_type null means no fixed schedule is
  // tracked for this project. For "day_of_month", draw_due_day is 1-31
  // (clamped to the month's last day). For "last_weekday", draw_due_day is
  // JS Date.getDay() convention: 0=Sunday..6=Saturday (e.g. 4=Thursday).
  draw_due_type: DrawDueType | null;
  draw_due_day: number | null;
}

export interface OwnerDraw {
  id: string;
  project_id: string;
  draw_number: number;
  period_start: string | null;
  period_end: string | null;
  amount_requested: number;
  amount_approved: number;
  retainage_held: number;
  amount_paid: number;
  date_submitted: string | null;
  date_approved: string | null;
  date_paid: string | null;
  status: DrawStatus;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  // Not a DB column — attached by lib/data.ts where allocations and budget
  // lines are in scope: the portion of this draw billed against a budget
  // line flagged excluded_from_contract (owner-paid scope, not HTA's).
  // openBalance() nets it out of "outstanding" so money that was never
  // HTA's to collect stops reading as owed. Undecorated draws default to 0
  // via `?? 0`, so every existing call site keeps working unchanged.
  excluded_allocated?: number;
}

export interface BudgetLine {
  id: string;
  project_id: string;
  item_number: string | null;
  category: string | null;
  description: string;
  scheduled_value: number;
  sort_order: number;
  retention_exempt: boolean;
  // Percent (e.g. 10 for 10%), not a fraction. When set, this line retains
  // at its own rate regardless of the draw's selected uniform retention
  // rate — for scope that customarily carries different retention than the
  // rest of the contract (e.g. an elevator sub). null means "use the
  // draw's rate," same as before this field existed. Takes effect only
  // when retention_exempt is false.
  retention_rate_override: number | null;
  excluded_from_contract: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface DrawLineAllocation {
  id: string;
  draw_id: string;
  budget_line_id: string;
  amount: number;
  created_at: string;
}

export interface OpenDraw extends OwnerDraw {
  project: Pick<Project, "id" | "name">;
}

export interface ProjectRollup {
  project: Project;
  totalRequested: number;
  totalApproved: number;
  totalDrawRetainage: number;
  totalPaidToOwner: number;
  totalOpenToOwner: number;
  // totalOpenToOwner can be entirely noise — several draws each under
  // MIN_MEANINGFUL_OPEN_BALANCE summing above it. True only when at least
  // one individual draw is itself a real, collectible balance; UI uses this
  // (not the raw total) to decide whether to render it as an alarm.
  hasMeaningfulOpenBalance: boolean;
  totalDraft: number;
  totalBudget: number;
  balanceToComplete: number;
  isDrawOverdue: boolean;
  isDrawUrgent: boolean;
  nextDrawLabel: string | null;
}
