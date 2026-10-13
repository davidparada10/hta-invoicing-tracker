"use client";

import { useTransition } from "react";
import { ProjectStatus } from "@/lib/types";
import { updateProjectStatus } from "@/app/projects/actions";
import { PROJECT_STATUS_TEXT_STYLES } from "@/lib/badgeTone";
import { withScrollPreserved } from "@/lib/preserveScroll";
import { confirmCloseProject } from "@/components/confirmClose";

const STATUSES: ProjectStatus[] = ["active", "closed"];

export default function ProjectStatusSelect({
  projectId,
  projectName,
  status,
}: {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ProjectStatus;
    if (next === status) return;
    startTransition(async () => {
      try {
        if (next === "closed" && !(await confirmCloseProject(projectId, projectName))) {
          e.target.value = status;
          return;
        }
        await withScrollPreserved(() => updateProjectStatus(projectId, next));
      } catch (err) {
        e.target.value = status;
        alert(err instanceof Error ? err.message : "Could not update project status.");
      }
    });
  }

  return (
    <span
      className={`relative inline-flex items-center text-xs font-semibold uppercase tracking-wide whitespace-nowrap rounded focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border ${PROJECT_STATUS_TEXT_STYLES[status]} ${
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
