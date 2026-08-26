import { OwnerDraw, SubInvoice } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

export default function ProjectSummaryCard({
  draws,
  subInvoices,
}: {
  draws: OwnerDraw[];
  subInvoices: SubInvoice[];
}) {
  const totalRequested = sum(draws.map((d) => d.amount_requested));
  const totalPaidToOwner = sum(
    draws.filter((d) => d.status === "paid").map((d) => d.amount_paid)
  );
  const totalOpenToOwner = sum(
    draws
      .filter((d) => d.status === "submitted" || d.status === "approved")
      .map((d) => d.amount_requested)
  );
  const drawRetainage = sum(draws.map((d) => d.retainage_held));

  const totalSubInvoiced = sum(subInvoices.map((s) => s.amount));
  const totalSubPaid = sum(subInvoices.map((s) => s.amount_paid));
  const totalSubOutstanding = totalSubInvoiced - totalSubPaid;
  const subRetainage = sum(subInvoices.map((s) => s.retainage_held));

  const paidPct = totalRequested > 0 ? Math.min(100, (totalPaidToOwner / totalRequested) * 100) : 0;
  const subPaidPct =
    totalSubInvoiced > 0 ? Math.min(100, (totalSubPaid / totalSubInvoiced) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Draws Paid of Requested
            </span>
            <span className="text-sm font-medium text-slate-900">{paidPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {formatCurrency(totalPaidToOwner)} paid · {formatCurrency(totalOpenToOwner)} open of{" "}
            {formatCurrency(totalRequested)} requested
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Sub Invoices Paid
            </span>
            <span className="text-sm font-medium text-slate-500">{subPaidPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${subPaidPct}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {formatCurrency(totalSubPaid)} of {formatCurrency(totalSubInvoiced)} paid
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
        <SummaryStat label="Sub Outstanding" value={formatCurrency(totalSubOutstanding)} />
        <SummaryStat label="Draw Retainage" value={formatCurrency(drawRetainage)} />
        <SummaryStat label="Sub Retainage" value={formatCurrency(subRetainage)} />
        <SummaryStat
          label="Total Retainage"
          value={formatCurrency(drawRetainage + subRetainage)}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
