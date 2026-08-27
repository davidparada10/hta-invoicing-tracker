"use client";

import { useTransition } from "react";
import { DrawStatus } from "@/lib/types";
import { updateDrawStatus } from "@/app/draws/actions";
import { STATUS_STYLES } from "@/lib/badgeTone";

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
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;

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
      className={`appearance-none rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium capitalize border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-border disabled:opacity-50 select-caret ${style}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
