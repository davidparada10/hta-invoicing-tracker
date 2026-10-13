"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ProjectRollup, ProjectStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import {
  inScope,
  outstandingAcrossAll,
  scopeTotals,
  type ResidualBalance,
  type StatusScope,
} from "@/lib/portfolio";
import ScopeToggle from "@/components/ScopeToggle";
import DashboardTable from "@/components/DashboardTable";

interface OpenDrawSummary {
  status: string;
  projectStatus: ProjectStatus;
}

// Owns the single Active / All state. Two kinds of numbers live here and are
// kept visibly apart:
//   - "Outstanding across all projects" (and the history rows) never change
//     with the toggle or the table search — money owed does not go away when a
//     project is closed.
//   - The portfolio summary and the table follow the toggle, via the same
//     rollupsInScope() set, so rows, developer subtotals and totals agree.
export default function PortfolioDashboard({
  rollups,
  residuals,
  openDraws,
  ytd,
  avgDaysOutstanding,
  openDrawsSlot,
}: {
  rollups: ProjectRollup[];
  residuals: ResidualBalance[];
  openDraws: OpenDrawSummary[];
  ytd: { year: number; billed: number; received: number };
  avgDaysOutstanding: number | null;
  openDrawsSlot: ReactNode;
}) {
  const [scope, setScope] = useState<StatusScope>("active");

  const outstanding = useMemo(() => outstandingAcrossAll(rollups), [rollups]);
  const totals = useMemo(() => scopeTotals(rollups, scope), [rollups, scope]);

  const allOpenDraws = openDraws.filter((d) => d.status !== "draft").length;
  const scopedOpenDraws = openDraws.filter(
    (d) => d.status !== "draft" && inScope(d.projectStatus, scope)
  ).length;
  const closedProjectTotal = rollups.filter((r) => r.project.status === "closed").length;
  const hasAlarm = rollups.some((r) => r.hasMeaningfulOpenBalance);

  const scopeLabel =
    scope === "active"
      ? `Active projects only · ${totals.projectCount} ${totals.projectCount === 1 ? "project" : "projects"}`
      : `All projects · ${totals.projectCount} (${totals.closedProjectCount} closed)`;

  return (
    <>
      {/* Hero — money still owed across every project, whatever its status. */}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
        Outstanding across all projects — awaiting payment
      </p>
      <p
        className={`text-4xl sm:text-5xl font-semibold tracking-tight ${
          hasAlarm ? "text-invoiced" : "text-foreground"
        }`}
      >
        {formatCurrency(outstanding.total)}
      </p>
      <div className="border-t border-foreground/70 border-b-[3px] border-b-foreground mt-3 mb-2" />
      <p className="text-sm text-muted-foreground">
        {allOpenDraws} open draws across {rollups.length} projects
        {outstanding.closed > 0.005
          ? ` · ${formatCurrency(outstanding.closed)} of it is on closed projects`
          : ""}
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Includes closed projects. Not affected by the Active / All view or by table search.
      </p>

      <details className="mb-8 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          What is included, and what is tracked separately
        </summary>
        <div className="mt-3 space-y-4">
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
            <dt className="text-muted-foreground">Active projects</dt>
            <dd className="text-right">{formatCurrency(outstanding.active)}</dd>
            <dt className="text-muted-foreground">Closed projects</dt>
            <dd className="text-right">{formatCurrency(outstanding.closed)}</dd>
            <dt className="font-medium text-foreground border-t border-border pt-1">Outstanding, all projects</dt>
            <dd className="text-right font-medium border-t border-border pt-1">
              {formatCurrency(outstanding.total)}
            </dd>
          </dl>

          <div>
            <p className="font-medium text-foreground">
              Retainage held, all projects: {formatCurrency(outstanding.retainageTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              Tracked separately and not part of the outstanding figure above.
              {outstanding.retainageClosed > 0.005
                ? ` ${formatCurrency(outstanding.retainageClosed)} of it is on closed projects:`
                : ""}
            </p>
            {outstanding.closedWithRetainage.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {outstanding.closedWithRetainage.map((p) => (
                  <li key={p.projectId} className="flex justify-between gap-4 tabular-nums">
                    <Link href={`/projects/${p.projectId}`} className="hover:underline">
                      {p.projectName} <span className="text-muted-foreground">(closed)</span>
                    </Link>
                    <span>{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {residuals.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Small balances not listed in Open Draws</p>
              <p className="text-xs text-muted-foreground">
                Each is $1,000 or less, so it is counted above but kept out of Open Draws and aging
                alerts.
              </p>
              <ul className="mt-1 space-y-0.5">
                {residuals.map((r) => (
                  <li
                    key={`${r.projectId}-${r.drawNumber}`}
                    className="flex justify-between gap-4 tabular-nums"
                  >
                    <Link href={`/projects/${r.projectId}`} className="hover:underline">
                      {r.projectName} draw #{r.drawNumber}
                      {r.projectStatus === "closed" && (
                        <span className="text-muted-foreground"> (closed)</span>
                      )}
                    </Link>
                    <span>{formatCurrency(r.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <div className="border-t border-border mb-8">
        {/* History — always every project; closing never removes it. */}
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-2">
          Year to date ({ytd.year}) · all projects, active and closed
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-border">
          <Link href="/billing" className="py-3 block hover:bg-muted">
            <p className="text-xs text-muted-foreground mb-1">Billed</p>
            <p className="text-xl font-semibold text-foreground">{formatCurrency(ytd.billed)}</p>
          </Link>
          <Link href="/billing" className="py-3 sm:pl-4 sm:border-l border-border block hover:bg-muted">
            <p className="text-xs text-muted-foreground mb-1">Received</p>
            <p className="text-xl font-semibold text-paid">{formatCurrency(ytd.received)}</p>
          </Link>
          <div className="py-3 sm:pl-4 sm:border-l border-border">
            <p className="text-xs text-muted-foreground mb-1">Avg. days outstanding (open draws)</p>
            <p className="text-xl font-semibold text-foreground">
              {avgDaysOutstanding !== null ? `${avgDaysOutstanding} days` : "—"}
            </p>
          </div>
        </div>

        {/* Portfolio summary — follows Active / All. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-4 pb-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Portfolio summary
          </p>
          <ScopeToggle value={scope} onChange={setScope} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {scopeLabel}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-border">
          <Figure label="Contract value" value={formatCurrency(totals.totalBudget)} first />
          <Figure label="Paid to date" value={formatCurrency(totals.totalPaidToOwner)} tone="paid" />
          <Figure label="Balance to complete" value={formatCurrency(totals.balanceToComplete)} />
          <Figure
            label="% billed of contract"
            value={totals.pctBilled === null ? "—" : `${(totals.pctBilled * 100).toFixed(0)}%`}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-border">
          <Figure
            label={scope === "active" ? "Active projects" : "Projects"}
            value={
              scope === "all" && closedProjectTotal > 0
                ? `${totals.projectCount} (${totals.closedProjectCount} closed)`
                : String(totals.projectCount)
            }
            first
          />
          <Figure label="Open draws" value={String(scopedOpenDraws)} />
          <Figure label="Retainage held" value={formatCurrency(totals.totalRetainage)} />
          <div className="py-3 lg:pl-4 lg:border-l border-border">
            <p
              className={`text-xs mb-1 ${
                totals.totalDraft > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
              }`}
            >
              Draft invoices, not yet submitted
            </p>
            <p
              className={`text-xl font-semibold ${
                totals.totalDraft > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground"
              }`}
            >
              {formatCurrency(totals.totalDraft)}
            </p>
          </div>
        </div>
        {scope === "active" && closedProjectTotal > 0 && (
          <p className="text-xs text-muted-foreground pt-2">
            Closed projects are left out of this summary. Their unpaid balances still count in
            Outstanding across all projects above.
          </p>
        )}
      </div>

      {openDrawsSlot}

      <DashboardTable rollups={rollups} statusFilter={scope} onStatusFilterChange={setScope} />
    </>
  );
}

function Figure({
  label,
  value,
  tone,
  first,
}: {
  label: string;
  value: string;
  tone?: "paid";
  first?: boolean;
}) {
  return (
    <div className={`py-3 ${first ? "" : "lg:pl-4 lg:border-l border-border"}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-semibold ${tone === "paid" ? "text-paid" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
