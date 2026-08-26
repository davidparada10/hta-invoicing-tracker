export type ProjectStatus = "active" | "closed";
export type DrawStatus = "draft" | "submitted" | "approved" | "paid";
export type SubInvoiceStatus = "received" | "approved" | "paid" | "disputed";

export interface Project {
  id: string;
  name: string;
  project_number: string;
  address: string | null;
  lender: string | null;
  status: ProjectStatus;
  created_at: string;
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

export interface SubInvoice {
  id: string;
  project_id: string;
  subcontractor_name: string;
  trade: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number;
  retainage_held: number;
  amount_paid: number;
  date_paid: string | null;
  status: SubInvoiceStatus;
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
  totalSubInvoiced: number;
  totalSubPaid: number;
  totalSubOutstanding: number;
  totalSubRetainage: number;
}
