"use client";

import { useMemo, useState } from "react";
import { BudgetLine, DrawLineAllocation, OwnerDraw, Project } from "@/lib/types";
import Modal from "@/components/Modal";
import DrawFormModal from "@/components/DrawFormModal";
import { getDrawFormContext } from "@/app/draws/actions";

export default function AddDrawModal({
  projects,
}: {
  projects: Pick<Project, "id" | "name" | "status">[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [draws, setDraws] = useState<OwnerDraw[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [allocations, setAllocations] = useState<DrawLineAllocation[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");

  const activeProjects = projects.filter((p) => p.status === "active");

  // Type-to-search: matches anywhere in the name, case-insensitive.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? activeProjects.filter((p) => p.name.toLowerCase().includes(q)) : activeProjects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, projects]);

  function choose(p: Pick<Project, "id" | "name">) {
    setProjectId(p.id);
    setQuery(p.name);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (projectId) void handleContinue();
      else if (matches[highlight]) choose(matches[highlight]);
    }
  }

  async function handleContinue() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await getDrawFormContext(projectId);
      setDraws(ctx.draws);
      setBudgetLines(ctx.budgetLines);
      setAllocations(ctx.allocations);
      setActiveProjectId(projectId);
      setPickerOpen(false);
      setFormOpen(true);
    } catch {
      setError("Could not load that project. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setProjectId("");
          setQuery("");
          setHighlight(0);
          setError(null);
          setPickerOpen(true);
        }}
        className="rounded-lg bg-primary text-background text-sm font-medium px-3 py-1.5"
      >
        + Add Draw
      </button>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add Draw">
        <div className="space-y-3">
          <div>
            <label htmlFor="add-draw-project" className="block text-xs font-medium text-muted-foreground mb-1">
              Project
            </label>
            <input
              id="add-draw-project"
              type="text"
              role="combobox"
              aria-expanded={!projectId}
              aria-controls="add-draw-project-list"
              autoComplete="off"
              autoFocus
              placeholder="Type to search projects…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setProjectId("");
                setHighlight(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="input"
            />
            {!projectId && (
              <ul
                id="add-draw-project-list"
                role="listbox"
                className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background"
              >
                {matches.map((p, i) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(p);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`px-3 py-1.5 text-sm cursor-pointer ${
                      i === highlight ? "bg-muted" : ""
                    }`}
                  >
                    {p.name}
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-1.5 text-sm text-muted-foreground">
                    No active projects match.
                  </li>
                )}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!projectId || loading}
              className="text-sm px-3 py-1.5 rounded-lg bg-primary text-background font-medium disabled:opacity-50"
            >
              {loading ? "Loading…" : "Continue"}
            </button>
          </div>
        </div>
      </Modal>

      <DrawFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projectId={activeProjectId}
        editing={null}
        draws={draws}
        budgetLines={budgetLines}
        allocations={allocations}
      />
    </>
  );
}
