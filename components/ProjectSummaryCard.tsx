import { OwnerDraw } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { computeProjectSummary } from "@/lib/projectSummary";

export default function ProjectSummaryCard({ draws }: { draws: OwnerDraw[] }) {
  const {
    totalRequested,
    totalPaidToOwner,
    totalOpenToOwner,
    retainageHeld,
    hasMeaningfulOpenBalance,
    paidPct,
  } = computeProjectSummary(draws);

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-6">
      <div className="flex items-baseline justify-between mb-1">
        <span
          className="text-xs text-muted-foreground"
          title="Settled vs. HTA's own billed total — excludes draft draws and owner-paid (non-HTA) scope. Each draw's own overpayment doesn't count toward a different, still-unpaid draw."
        >
          Settled of HTA&rsquo;s billed total
        </span>
        <span className="text-sm font-medium text-foreground">{paidPct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-paid rounded-full" style={{ width: `${paidPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {formatCurrency(totalPaidToOwner)} paid · {formatCurrency(totalOpenToOwner)} open of{" "}
        {formatCurrency(totalRequested)} requested
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border">
        <SummaryStat label="Requested" value={formatCurrency(totalRequested)} />
        <SummaryStat
          label="Currently invoiced"
          value={formatCurrency(totalOpenToOwner)}
          valueClassName={hasMeaningfulOpenBalance ? "text-invoiced" : "text-foreground"}
        />
        <SummaryStat
          label="Paid"
          value={formatCurrency(totalPaidToOwner)}
          valueClassName="text-paid"
        />
        <SummaryStat label="Retainage held" value={formatCurrency(retainageHeld)} />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}
