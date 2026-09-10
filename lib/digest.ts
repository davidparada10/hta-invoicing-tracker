import { getDashboardData, getOpenDraws, openBalance } from "@/lib/data";
import { agingBucket, daysOpen } from "@/lib/aging";
import { formatCurrency } from "@/lib/format";

// Same criteria as AgingAlertBanner / DrawsDueAlertBanner on the dashboard —
// this digest is a scheduled echo of those two banners, not a new source of
// truth, so a project shows up here exactly when it would show up there.
export async function buildDigestContent(): Promise<{
  hasContent: boolean;
  subject: string;
  html: string;
  text: string;
} | null> {
  const [{ rollups }, openDraws] = await Promise.all([getDashboardData(), getOpenDraws()]);

  const stale = openDraws
    .map((d) => ({ draw: d, age: daysOpen(d.date_submitted ?? d.created_at) }))
    .filter(({ age }) => agingBucket(age) === "61-90" || agingBucket(age) === "90+")
    .sort((a, b) => b.age - a.age);

  const overdueProjects = rollups.filter((r) => r.isDrawOverdue);

  if (stale.length === 0 && overdueProjects.length === 0) {
    return null;
  }

  const staleRows = stale
    .map(
      ({ draw, age }) =>
        `<li>${draw.project.name} draw #${draw.draw_number} — ${age} days, ${formatCurrency(
          openBalance(draw)
        )} outstanding</li>`
    )
    .join("");

  const overdueRows = overdueProjects
    .map((r) => `<li>${r.project.name} (${r.nextDrawLabel ?? "no cadence set"})</li>`)
    .join("");

  const html = `
    <h2>HTA Invoice Tracker — Daily Digest</h2>
    ${
      stale.length > 0
        ? `<h3>${stale.length} draw${stale.length === 1 ? "" : "s"} open 60+ days</h3><ul>${staleRows}</ul>`
        : ""
    }
    ${
      overdueProjects.length > 0
        ? `<h3>${overdueProjects.length} project${
            overdueProjects.length === 1 ? "" : "s"
          } need a draw created this month</h3><ul>${overdueRows}</ul>`
        : ""
    }
    <p><a href="https://hta-invoicing-tracker.vercel.app">Open the tracker</a></p>
  `.trim();

  const text = [
    "HTA Invoice Tracker — Daily Digest",
    stale.length > 0
      ? `\n${stale.length} draw(s) open 60+ days:\n` +
        stale
          .map(
            ({ draw, age }) =>
              `- ${draw.project.name} draw #${draw.draw_number} — ${age} days, ${formatCurrency(
                openBalance(draw)
              )} outstanding`
          )
          .join("\n")
      : "",
    overdueProjects.length > 0
      ? `\n${overdueProjects.length} project(s) need a draw created this month:\n` +
        overdueProjects.map((r) => `- ${r.project.name} (${r.nextDrawLabel ?? "no cadence set"})`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    hasContent: true,
    subject: `HTA Invoice Tracker: ${stale.length + overdueProjects.length} item${
      stale.length + overdueProjects.length === 1 ? "" : "s"
    } need attention`,
    html,
    text,
  };
}
