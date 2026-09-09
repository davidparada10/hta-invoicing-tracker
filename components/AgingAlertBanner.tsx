import Link from "next/link";
import { OpenDraw } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { agingBucket, daysOpen } from "@/lib/aging";

function openBalance(d: OpenDraw): number {
  if (d.status === "draft") return 0;
  return Math.max(0, (d.amount_requested ?? 0) - (d.amount_paid ?? 0));
}

// Only draws that have actually crossed into "needs a call" territory (61+
// days since submission) surface here — 31-60 day draws are still visible in
// the aging strip below, just not alert-worthy on their own.
export default function AgingAlertBanner({ draws }: { draws: OpenDraw[] }) {
  const stale = draws
    .map((d) => ({ draw: d, age: daysOpen(d.date_submitted ?? d.created_at) }))
    .filter(({ age }) => agingBucket(age) === "61-90" || agingBucket(age) === "90+")
    .sort((a, b) => b.age - a.age);

  if (stale.length === 0) return null;

  const totalAtRisk = stale.reduce((acc, { draw }) => acc + openBalance(draw), 0);
  const oldest = stale[0];

  return (
    <Link
      href="/?aging=stale#open-draws"
      className="group block mb-6 border-l-[3px] border-red-600 dark:border-red-500 pl-4 py-1"
    >
      <p className="text-sm text-foreground">
        <span className="font-semibold">
          {stale.length} {stale.length === 1 ? "draw has" : "draws have"} been open 60+ days
        </span>
        {" — "}
        <span className="font-semibold text-red-600 dark:text-red-400 group-hover:underline">
          {formatCurrency(totalAtRisk)} at risk
        </span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Oldest: {oldest.draw.project.name} draw #{oldest.draw.draw_number}, {oldest.age} days —{" "}
        {formatCurrency(openBalance(oldest.draw))} outstanding. View all in Open Draws below.
      </p>
    </Link>
  );
}
