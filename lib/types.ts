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
  created_at: string;
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
  totalDraft: number;
  totalBudget: number;
  balanceToComplete: number;
  isDrawOverdue: boolean;
  isDrawUrgent: boolean;
}
