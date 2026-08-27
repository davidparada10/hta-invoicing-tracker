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
    startTransition(() => {
      updateProjectStatus(projectId, next);
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Change project status"
      title="Change status"
      className={`appearance-none rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium capitalize border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-border disabled:opacity-50 select-caret ${PROJECT_STATUS_STYLES[status]}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
