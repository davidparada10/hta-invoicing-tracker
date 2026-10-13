"use client";

import type { StatusScope } from "@/lib/portfolio";

// The one Active / All control. The dashboard renders it in two places (above
// the portfolio summary and beside the table search) bound to the same state,
// so the rows, developer subtotals and summary can never disagree.
export default function ScopeToggle({
  value,
  onChange,
}: {
  value: StatusScope;
  onChange: (scope: StatusScope) => void;
}) {
  const base = "px-3 py-1.5";
  return (
    <div role="group" aria-label="Project status view" className="inline-flex rounded-lg border border-border text-sm overflow-hidden">
      <button
        type="button"
        aria-pressed={value === "active"}
        onClick={() => onChange("active")}
        className={`${base} ${value === "active" ? "bg-primary text-background" : "text-muted-foreground hover:bg-muted"}`}
      >
        Active
      </button>
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={`${base} border-l border-border ${value === "all" ? "bg-primary text-background" : "text-muted-foreground hover:bg-muted"}`}
      >
        All
      </button>
    </div>
  );
}
