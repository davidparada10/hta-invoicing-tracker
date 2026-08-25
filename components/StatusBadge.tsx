import { DrawStatus, SubInvoiceStatus } from "@/lib/types";

const STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  received: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  disputed: "bg-red-100 text-red-700",
};

export default function StatusBadge({
  status,
}: {
  status: DrawStatus | SubInvoiceStatus;
}) {
  const style = STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}
