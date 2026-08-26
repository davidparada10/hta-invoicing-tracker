"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectStatus } from "@/lib/types";
import Modal from "@/components/Modal";
import { createProject } from "@/app/projects/actions";

const STATUSES: ProjectStatus[] = ["active", "closed"];

export default function AddProjectModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const { id } = await createProject(formData);
      setOpen(false);
      router.push(`/projects/${id}`);
    } catch {
      setError("Could not create project. Please try again.");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
      >
        + Add Project
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Project">
        <form action={handleSubmit} className="space-y-3">
          <Field label="Project name">
            <input name="name" required className="input" />
          </Field>

          <Field label="Address">
            <input name="address" className="input" />
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium"
            >
              Save
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
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
