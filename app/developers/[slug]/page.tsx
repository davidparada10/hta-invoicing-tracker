import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getDashboardData, getDeveloperBillingBreakdown, getOpenDraws, getProjects } from "@/lib/data";
import { buildGroupSummary } from "@/lib/groupSummary";
import { findGroupBySlug } from "@/lib/groupSlug";
import { businessToday, formatCurrency, formatDate, formatDaysToPay } from "@/lib/format";

export const dynamic = "force-dynamic";

// One developer's projects in one place. Every figure comes from the same
// per-project numbers the dashboard and the assistant use (lib/groupSummary.ts);
// this page defines no calculation of its own.
export default async function DeveloperPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const projects = await getProjects();
  const name = findGroupBySlug(slug, projects.map((p) => p.developer));
  if (!name) notFound();

  const year = businessToday().getFullYear();
  const [dash, openDraws, billingRows] = await Promise.all([
    getDashboardData(),
    getOpenDraws(),
    getDeveloperBillingBreakdown(year),
  ]);
  const summary = buildGroupSummary("developer", name, dash.rollups, openDraws, dash.residuals);
  const ytd = billingRows.find((r) => r.groupName === name);
  const t = summary.totals;
  const closedCount = summary.projects.filter((p) => p.status === "closed").length;

  const stats: { label: string; value: number; tone?: string; note?: string }[] = [
    { label: "Invoiced to date", value: t.invoicedToDate },
    { label: "Paid", value: t.paidToDate, tone: "text-paid" },
    { label: "Outstanding", value: t.outstanding, tone: t.outstanding > 0.005 ? "text-invoiced" : undefined },
    { label: "Retainage held", value: t.retainageHeld, note: "Separate from outstanding" },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Overview
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">{name}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {summary.projects.length} project{summary.projects.length === 1 ? "" : "s"}
          {closedCount > 0 ? ` (${closedCount} closed)` : ""} · active and closed are both included.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-border mb-2">
          {stats.map((s, i) => (
            <div key={s.label} className={`py-3 ${i > 0 ? "lg:pl-4 lg:border-l border-border" : ""}`}>
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-xl font-semibold tabular-nums ${s.tone ?? "text-foreground"}`}>
                {formatCurrency(s.value)}
              </p>
              {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-8">
          Invoiced is the amount requested on submitted, approved and paid draws, net of retainage.
          {t.draftsNotYetSubmitted > 0
            ? ` ${formatCurrency(t.draftsNotYetSubmitted)} more is in drafts that are not yet submitted.`
            : ""}
        </p>

        {ytd && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-1">{year} so far</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              Billed {formatCurrency(ytd.requested)} · received {formatCurrency(ytd.received)} · average{" "}
              {formatDaysToPay(ytd.avgDaysToPay)} to pay
            </p>
          </div>
        )}

        <h2 className="text-sm font-semibold text-foreground mb-2">Projects</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card mb-8">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs">
              <tr>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-right px-3 py-2">Invoiced</th>
                <th className="text-right px-3 py-2">Paid</th>
                <th className="text-right px-3 py-2">Outstanding</th>
                <th className="text-right px-3 py-2">Retainage</th>
              </tr>
            </thead>
            <tbody>
              {summary.projects.map((p) => (
                <tr key={p.projectId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/projects/${p.projectId}`} className="hover:underline">
                      {p.project}
                    </Link>
                    {p.status === "closed" && <span className="text-muted-foreground"> (closed)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.invoicedToDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-paid">{formatCurrency(p.paidToDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-invoiced">{formatCurrency(p.outstanding)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.retainageHeld)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-2">Unpaid draws</h2>
        {summary.unpaidDraws.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-8">Nothing is waiting on payment.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card mb-2">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Draw</th>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Requested</th>
                  <th className="text-right px-3 py-2">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {summary.unpaidDraws.map((d) => (
                  <tr key={`${d.projectId}-${d.drawNumber}`} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${d.projectId}`} className="hover:underline">
                        {d.project}
                      </Link>
                    </td>
                    <td className="px-3 py-2">#{d.drawNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(d.dateSubmitted)}</td>
                    <td className="px-3 py-2 capitalize">{d.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.amountRequested)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-invoiced">
                      {formatCurrency(d.outstandingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary.smallBalancesNotListed.length > 0 && (
          <p className="text-xs text-muted-foreground mb-8">
            Also counted above: {summary.smallBalancesNotListed.length} small balance
            {summary.smallBalancesNotListed.length === 1 ? "" : "s"} of $1,000 or less that aren&rsquo;t listed as
            unpaid draws.
          </p>
        )}
      </main>
    </div>
  );
}
