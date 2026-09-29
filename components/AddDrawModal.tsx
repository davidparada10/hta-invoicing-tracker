"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [draws, setDraws] = useState<OwnerDraw[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [allocations, setAllocations] = useState<DrawLineAllocation[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");

  const activeProjects = projects.filter((p) => p.status === "active");

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
          setError(null);
          setPickerOpen(true);
        }}
        className="rounded-lg bg-primary text-background text-sm font-medium px-3 py-1.5"
      >
        + Add Draw
      </button>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add Draw">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
              autoFocus
            >
              <option value="" disabled>
                Select a project
              </option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

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
