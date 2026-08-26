"use client";

import { useTransition } from "react";
import { markDrawPaid } from "@/app/draws/actions";

export default function MarkPaidButton({
  drawId,
  projectId,
  drawNumber,
  className,
}: {
  drawId: string;
  projectId: string;
  drawNumber: number;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Mark draw #${drawNumber} as paid?`)) return;
    startTransition(() => {
      markDrawPaid(drawId, projectId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={
        className ??
        "text-emerald-600 hover:text-emerald-800 text-xs font-medium disabled:opacity-50"
      }
    >
      {isPending ? "Marking…" : "Mark Paid"}
    </button>
  );
}
