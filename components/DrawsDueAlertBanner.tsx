import { ProjectRollup } from "@/lib/types";

// Amber, not red — this is a forward-looking reminder ("go create a draft"),
// not a financial risk like AgingAlertBanner's stale-payment warning.
export default function DrawsDueAlertBanner({ rollups }: { rollups: ProjectRollup[] }) {
  const overdue = rollups.filter((r) => r.isDrawOverdue);
  if (overdue.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
        {overdue.length} {overdue.length === 1 ? "project needs" : "projects need"} a draw created
        this month
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        {overdue
          .map((r) => `${r.project.name} (${r.nextDrawLabel ?? "no cadence set"})`)
          .join(" · ")}
      </p>
    </div>
  );
}
