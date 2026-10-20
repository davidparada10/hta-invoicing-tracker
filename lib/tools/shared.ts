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

// Resolves a developer name the way a person would type it ("hvn", "Hi Point")
// against the developers that actually appear on projects. An exact match
// (ignoring case) wins; otherwise a single partial match; ambiguity or no
// match returns an error that lists the real options.
export function matchDeveloper(
  developer: string,
  projects: Pick<Project, "developer">[]
): { developer: string } | { error: string } {
  const names = [...new Set(projects.map((p) => p.developer).filter((d): d is string => !!d))].sort();
  const q = developer.trim().toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === q);
  if (exact) return { developer: exact };
  const partial = q ? names.filter((n) => n.toLowerCase().includes(q)) : [];
  if (partial.length === 1) return { developer: partial[0] };
  if (partial.length > 1) {
    return { error: `Multiple developers match "${developer}": ${partial.join(", ")}. Ask the user which one they mean.` };
  }
  return { error: `No developer found matching "${developer}". Developers on file: ${names.join(", ")}.` };
}
