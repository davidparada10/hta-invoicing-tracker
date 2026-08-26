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
