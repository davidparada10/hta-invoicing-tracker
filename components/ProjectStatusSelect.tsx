"use client";

import { useTransition } from "react";
import { ProjectStatus } from "@/lib/types";
import { updateProjectStatus } from "@/app/projects/actions";

const STATUSES: ProjectStatus[] = ["active", "closed"];

const STYLES: Record<ProjectStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
};

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
      className={`appearance-none rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium capitalize border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50 bg-no-repeat bg-[length:10px] bg-[right_0.45rem_center] ${STYLES[status]}`}
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
