import Link from "next/link";
import { OpenDraw } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import MarkPaidButton from "@/components/MarkPaidButton";

export default function OpenDrawsSection({ draws }: { draws: OpenDraw[] }) {
  const totalOpen = draws.reduce((acc, d) => acc + (d.amount_requested ?? 0), 0);

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900">Open Owner Draws</h2>
        <span className="text-sm text-slate-500">
          {draws.length} open · {formatCurrency(totalOpen)} awaiting payment
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Draws invoiced to the lender/owner that have not yet been paid, oldest first.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Project</th>
              <th className="text-left px-4 py-2">Draw #</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-right px-4 py-2">Requested</th>
              <th className="text-right px-4 py-2">Approved</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draws.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/projects/${d.project.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {d.project.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{d.draw_number}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(d.date_submitted)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_requested)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(d.amount_approved)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <MarkPaidButton drawId={d.id} projectId={d.project.id} drawNumber={d.draw_number} />
                </td>
              </tr>
            ))}
            {draws.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No open draws. Everything invoiced has been paid.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
