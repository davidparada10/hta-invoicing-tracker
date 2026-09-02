"use client";

import { useState } from "react";
import { Project, ProjectStatus } from "@/lib/types";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { updateProject } from "@/app/projects/actions";

const STATUSES: ProjectStatus[] = ["active", "closed"];
const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export default function EditProjectModal({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [dueType, setDueType] = useState(project.draw_due_type ?? "");

  async function handleSubmit(formData: FormData) {
    await updateProject(formData);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-card text-foreground text-sm font-medium px-3 py-1.5 hover:bg-muted"
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Draw cadence">
              <select
                name="draw_due_type"
                value={dueType}
                onChange={(e) => setDueType(e.target.value)}
                className="input"
              >
                <option value="">No fixed cadence</option>
                <option value="day_of_month">Day of month</option>
                <option value="last_weekday">Last weekday of month</option>
              </select>
            </Field>
            {dueType === "day_of_month" && (
              <Field label="Day">
                <input
                  type="number"
                  name="draw_due_day"
                  min={1}
                  max={31}
                  required
                  defaultValue={project.draw_due_type === "day_of_month" ? project.draw_due_day ?? "" : ""}
                  className="input"
                />
              </Field>
            )}
            {dueType === "last_weekday" && (
              <Field label="Weekday">
                <select
                  name="draw_due_day"
                  required
                  defaultValue={
                    project.draw_due_type === "last_weekday" ? project.draw_due_day ?? "" : ""
                  }
                  className="input"
                >
                  <option value="" disabled>
                    Select a weekday
                  </option>
                  {WEEKDAYS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded-lg bg-primary text-background font-medium"
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
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
