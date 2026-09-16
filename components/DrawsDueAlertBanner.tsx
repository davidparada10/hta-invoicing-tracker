import { ProjectRollup } from "@/lib/types";

// Amber, not red — this is a forward-looking reminder ("go create a draft"),
// not a financial risk like AgingAlertBanner's stale-payment warning.
export default function DrawsDueAlertBanner({ rollups }: { rollups: ProjectRollup[] }) {
  const overdue = rollups.filter((r) => r.isDrawOverdue);
  if (overdue.length === 0) return null;

  return (
    <div className="mb-6 rounded-r-lg border-l-4 border-amber-500 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 pl-4 pr-4 py-3">
      <p className="text-base font-semibold text-foreground">
        {overdue.length} {overdue.length === 1 ? "project needs" : "projects need"} a draw created
        this month
      </p>
      <p className="text-sm text-muted-foreground mt-0.5">
        {overdue
          .map((r) => `${r.project.name} (${r.nextDrawLabel ?? "no cadence set"})`)
          .join(" · ")}
      </p>
    </div>
  );
}
