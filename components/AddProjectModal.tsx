"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectStatus } from "@/lib/types";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { createProject } from "@/app/projects/actions";
import { importBudgetFromXlsx } from "@/app/budget/actions";

const STATUSES: ProjectStatus[] = ["active", "closed"];

export default function AddProjectModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      setStatusText("Creating project…");
      const { id } = await createProject(formData);

      const budgetFile = formData.get("budget_file");
      if (budgetFile instanceof File && budgetFile.size > 0) {
        setStatusText("Importing schedule of values…");
        const budgetFormData = new FormData();
        budgetFormData.set("budget_file", budgetFile);
        budgetFormData.set("project_id", id);
        try {
          await importBudgetFromXlsx(budgetFormData);
        } catch (budgetErr) {
          // The project was created successfully; only the budget import
          // failed. Don't block navigation — let them retry it from the
          // Schedule of Values tab, where the same import lives.
          setOpen(false);
          router.push(`/projects/${id}?tab=budget`);
          alert(
            `Project created, but the schedule-of-values import failed: ${
              budgetErr instanceof Error ? budgetErr.message : "Unknown error"
            }\n\nYou can retry the import from the Schedule of Values tab.`
          );
          return;
        }
      }

      setOpen(false);
      router.push(`/projects/${id}`);
    } catch {
      setError("Could not create project. Please try again.");
    } finally {
      setSubmitting(false);
      setStatusText(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-background text-sm font-medium px-3 py-1.5 hover:opacity-90"
      >
        + Add Project
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Project">
        <form action={handleSubmit} className="space-y-3">
          <Field label="Project name">
            <input name="name" required className="input" />
          </Field>

          <Field label="Address">
            <AddressAutocomplete className="input" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lender">
              <input name="lender" className="input" />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="active" className="input">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-lg border border-dashed border-border p-3 bg-muted">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Upload G702/G703 (.xlsx) to create the initial schedule of values (optional)
            </label>
            <input
              type="file"
              name="budget_file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={submitting}
              className="text-sm w-full"
            />
          </div>

          {statusText && <p className="text-xs text-muted-foreground">{statusText}</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="text-sm px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm px-3 py-1.5 rounded-lg bg-primary text-background font-medium disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
