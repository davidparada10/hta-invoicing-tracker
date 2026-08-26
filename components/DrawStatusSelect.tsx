"use client";

import { useTransition } from "react";
import { DrawStatus } from "@/lib/types";
import { updateDrawStatus } from "@/app/draws/actions";
import { STATUS_STYLES } from "@/components/StatusBadge";

const STATUSES: DrawStatus[] = ["draft", "submitted", "approved", "paid"];

export default function DrawStatusSelect({
  drawId,
  projectId,
  status,
}: {
  drawId: string;
  projectId: string;
  status: DrawStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DrawStatus;
    if (next === status) return;
    if (next === "paid" && !confirm("Mark this draw as paid?")) {
      e.target.value = status;
      return;
    }
    startTransition(() => {
      updateDrawStatus(drawId, projectId, next);
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Change draw status"
      title="Change status"
      className={`appearance-none rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium capitalize border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50 bg-no-repeat bg-[length:10px] bg-[right_0.45rem_center] ${style}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23475569' d='M3 4.5 6 8l3-3.5'/%3E%3C/svg%3E\")",
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
