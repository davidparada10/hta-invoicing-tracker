import Link from "next/link";
import { REVIEW_LABELS, REVIEW_ORDER, type ReviewItem } from "@/lib/dataReview";

// Things in the records worth a second look. Collapsed by default and hidden
// when there is nothing to review; it never edits anything.
export default function DataReviewSection({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-10 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">
        Data to review ({items.length})
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        These are possible gaps or typos in the records. Nothing is changed automatically.
      </p>
      <div className="mt-3 space-y-5">
        {REVIEW_ORDER.map((kind) => {
          const rows = items.filter((i) => i.kind === kind);
          if (rows.length === 0) return null;
          const { title, hint } = REVIEW_LABELS[kind];
          return (
            <div key={kind}>
              <p className="font-medium text-foreground">
                {title} ({rows.length})
              </p>
              <p className="text-xs text-muted-foreground">{hint}</p>
              <ul className="mt-1 space-y-0.5">
                {rows.map((r, i) => (
                  <li key={`${r.projectId}-${r.subject}-${i}`} className="flex flex-wrap justify-between gap-x-4">
                    <Link href={`/projects/${r.projectId}`} className="hover:underline">
                      {r.projectName} <span className="text-muted-foreground">· {r.subject}</span>
                    </Link>
                    <span className="text-muted-foreground tabular-nums">{r.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
