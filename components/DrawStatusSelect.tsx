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
    startTransition(async () => {
      try {
        await updateDrawStatus(drawId, projectId, next);
      } catch (err) {
        e.target.value = status;
        alert(err instanceof Error ? err.message : "Could not update draw status.");
      }
    });
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium capitalize whitespace-nowrap focus-within:ring-2 focus-within:ring-border ${style} ${
        isPending ? "opacity-50" : ""
      }`}
    >
      <span aria-hidden="true">{status}</span>
      <select
        value={status}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Change draw status"
        title="Change status"
        className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0 focus:outline-none disabled:cursor-not-allowed"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </span>
  );
}
