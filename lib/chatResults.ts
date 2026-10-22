// Turns an assistant tool result into something the chat can show. Pure
// functions (no React) so the shapes are unit-tested against what the tools in
// lib/tools/read-tools.ts actually return. Nothing here recomputes a financial
// figure: it only reads, labels and formats what the tool already calculated.

import { formatCurrency } from "@/lib/format";

export interface GroupStat {
  label: "Invoiced" | "Paid" | "Outstanding" | "Retainage held";
  value: number;
}

export interface GroupProjectRow {
  project: string;
  closed: boolean;
  invoiced: number;
  paid: number;
  outstanding: number;
  retainage: number;
}

export interface GroupSummaryView {
  kind: "group";
  /** "Developer" or "Lender", and the matched name. */
  groupType: "Developer" | "Lender";
  name: string;
  /** The tool's own scope sentence (all of its projects, active and closed). */
  scope: string;
  /** One plain sentence that states every figure; also used as the answer when the assistant wrote none. */
  headline: string;
  stats: GroupStat[];
  drafts: number;
  projects: GroupProjectRow[];
  unpaidDrawCount: number;
  smallBalanceCount: number;
}

export interface UnsupportedView {
  kind: "unsupported";
  toolName: string;
  message: string;
}

export type ToolResultView = GroupSummaryView | UnsupportedView;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function describeGroupSummary(toolName: string, output: unknown): ToolResultView {
  const unsupported: UnsupportedView = {
    kind: "unsupported",
    toolName,
    message: "I looked this up, but this result can't be shown as a table here.",
  };
  if (!isRecord(output) || !isRecord(output.totals) || !Array.isArray(output.projects)) return unsupported;

  const groupType = toolName === "getLenderSummary" ? "Lender" : "Developer";
  const nameRaw = groupType === "Lender" ? output.lender : output.developer;
  const invoiced = num(output.totals.invoicedToDate);
  const paid = num(output.totals.paidToDate);
  const outstanding = num(output.totals.outstanding);
  const retainage = num(output.totals.retainageHeld);
  if (typeof nameRaw !== "string" || invoiced === null || paid === null || outstanding === null || retainage === null) {
    return unsupported;
  }

  const projects: GroupProjectRow[] = [];
  for (const p of output.projects) {
    if (!isRecord(p) || typeof p.project !== "string") return unsupported;
    projects.push({
      project: p.project,
      closed: p.status === "closed",
      invoiced: num(p.invoicedToDate) ?? 0,
      paid: num(p.paidToDate) ?? 0,
      outstanding: num(p.outstanding) ?? 0,
      retainage: num(p.retainageHeld) ?? 0,
    });
  }

  const count = projects.length;
  const closed = projects.filter((p) => p.closed).length;
  const projectWord = `${count} project${count === 1 ? "" : "s"}${closed > 0 ? ` (${closed} closed)` : ""}`;
  return {
    kind: "group",
    groupType,
    name: nameRaw,
    scope: typeof output.scope === "string" ? output.scope : `${groupType} ${nameRaw}: its projects only`,
    headline:
      `${nameRaw}, across ${projectWord}: ${formatCurrency(paid)} paid of ${formatCurrency(invoiced)} invoiced, ` +
      `${formatCurrency(outstanding)} outstanding. Retainage held is ${formatCurrency(retainage)} and is tracked separately.`,
    stats: [
      { label: "Invoiced", value: invoiced },
      { label: "Paid", value: paid },
      { label: "Outstanding", value: outstanding },
      { label: "Retainage held", value: retainage },
    ],
    drafts: num(output.totals.draftsNotYetSubmitted) ?? 0,
    projects,
    unpaidDrawCount: Array.isArray(output.unpaidDraws) ? output.unpaidDraws.length : 0,
    smallBalanceCount: Array.isArray(output.smallBalancesNotListed) ? output.smallBalancesNotListed.length : 0,
  };
}

// Tools whose results have a dedicated card in the chat.
export const GROUP_SUMMARY_TOOLS = new Set(["getDeveloperSummary", "getLenderSummary"]);

// When the assistant finishes without any written text, this is what the
// chat shows as the answer: the first result that can be stated in a sentence,
// or an honest note that no answer came back. Never an empty reply.
export function fallbackAnswer(
  results: { toolName: string; output: unknown }[],
  hadError: boolean
): string {
  for (const r of results) {
    if (!GROUP_SUMMARY_TOOLS.has(r.toolName)) continue;
    const view = describeGroupSummary(r.toolName, r.output);
    if (view.kind === "group") return view.headline;
  }
  return hadError
    ? "I couldn't finish that lookup. Try asking again."
    : "I got the data but didn't write an answer. Ask again, or ask a more specific question.";
}
