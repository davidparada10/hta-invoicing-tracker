import { OwnerDraw } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { openBalance } from "@/lib/data";

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

export default function ProjectSummaryCard({ draws }: { draws: OwnerDraw[] }) {
  const totalRequested = sum(draws.map((d) => d.amount_requested));
  const totalPaidToOwner = sum(
    draws.filter((d) => d.status !== "draft").map((d) => d.amount_paid)
  );
  const totalOpenToOwner = sum(draws.map(openBalance));
  const retainageHeld = sum(draws.map((d) => d.retainage_held));

  const paidPct = totalRequested > 0 ? Math.min(100, (totalPaidToOwner / totalRequested) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Draws Paid of Requested
        </span>
        <span className="text-sm font-medium text-slate-900">{paidPct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {formatCurrency(totalPaidToOwner)} paid · {formatCurrency(totalOpenToOwner)} open of{" "}
        {formatCurrency(totalRequested)} requested
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
        <SummaryStat label="Requested" value={formatCurrency(totalRequested)} />
        <SummaryStat
          label="Currently Invoiced"
          value={formatCurrency(totalOpenToOwner)}
          valueClassName="text-red-500"
        />
        <SummaryStat
          label="Paid"
          value={formatCurrency(totalPaidToOwner)}
          valueClassName="text-emerald-700"
        />
        <SummaryStat label="Retainage Held" value={formatCurrency(retainageHeld)} />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName = "text-slate-900",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}
