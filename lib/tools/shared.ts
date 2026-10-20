import { getProjects } from "@/lib/data";
import { Project } from "@/lib/types";

export async function resolveProject(
  projectName: string
): Promise<{ project: Project } | { error: string }> {
  const projects = await getProjects();
  const q = projectName.trim().toLowerCase();

  const exact = projects.find((p) => p.name.toLowerCase() === q);
  if (exact) return { project: exact };

  const partial = projects.filter((p) => p.name.toLowerCase().includes(q));
  if (partial.length === 1) return { project: partial[0] };
  if (partial.length > 1) {
    return {
      error: `Multiple projects match "${projectName}": ${partial
        .map((p) => p.name)
        .join(", ")}. Ask the user which one they mean.`,
    };
  }

  return {
    error: `No project found matching "${projectName}". Available projects: ${projects
      .map((p) => p.name)
      .join(", ")}.`,
  };
}

// Resolves a developer or lender name the way a person would type it ("hvn",
// "Hi Point") against the values that actually appear on projects. An exact
// match (ignoring case) wins; otherwise a single partial match; ambiguity or
// no match returns an error that lists the real options.
export type GroupField = "developer" | "lender";
type Grouped = { developer?: string | null; lender?: string | null };

export function matchGroup(
  field: GroupField,
  value: string,
  projects: Grouped[]
): { name: string } | { error: string } {
  const names = [...new Set(projects.map((p) => p[field]).filter((n): n is string => !!n))].sort();
  const q = value.trim().toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === q);
  if (exact) return { name: exact };
  const partial = q ? names.filter((n) => n.toLowerCase().includes(q)) : [];
  if (partial.length === 1) return { name: partial[0] };
  if (partial.length > 1) {
    return { error: `Multiple ${field}s match "${value}": ${partial.join(", ")}. Ask the user which one they mean.` };
  }
  return { error: `No ${field} found matching "${value}". ${field[0].toUpperCase()}${field.slice(1)}s on file: ${names.join(", ")}.` };
}

export function matchDeveloper(
  developer: string,
  projects: Grouped[]
): { developer: string } | { error: string } {
  const m = matchGroup("developer", developer, projects);
  return "error" in m ? m : { developer: m.name };
}
