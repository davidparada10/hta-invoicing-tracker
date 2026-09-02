"use client";

import { useTransition } from "react";
import { ProjectStatus } from "@/lib/types";
import { updateProjectStatus } from "@/app/projects/actions";
import { PROJECT_STATUS_STYLES } from "@/lib/badgeTone";

const STATUSES: ProjectStatus[] = ["active", "closed"];

export default function ProjectStatusSelect({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ProjectStatus;
    if (next === status) return;
    startTransition(async () => {
      try {
        await updateProjectStatus(projectId, next);
      } catch (err) {
        e.target.value = status;
        alert(err instanceof Error ? err.message : "Could not update project status.");
      }
    });
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium capitalize whitespace-nowrap focus-within:ring-2 focus-within:ring-border ${PROJECT_STATUS_STYLES[status]} ${
        isPending ? "opacity-50" : ""
      }`}
    >
      <span aria-hidden="true">{status}</span>
      <select
        value={status}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Change project status"
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
