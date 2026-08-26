"use client";

import { useState } from "react";
import { Project, ProjectStatus } from "@/lib/types";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { updateProject } from "@/app/projects/actions";

const STATUSES: ProjectStatus[] = ["active", "closed"];

export default function EditProjectModal({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(formData: FormData) {
    await updateProject(formData);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50"
      >
        Edit Project
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit Project">
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="id" value={project.id} />

          <Field label="Project name">
            <input name="name" required defaultValue={project.name} className="input" />
          </Field>

          <Field label="Address">
            <AddressAutocomplete defaultValue={project.address ?? ""} className="input" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lender">
              <input name="lender" defaultValue={project.lender ?? ""} className="input" />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={project.status} className="input">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

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
