import type { Project } from "@lmesh/api-contract";

const DESCRIPTION_PREVIEW_MAX = 80;

/** Three starter prompts built from the project's title and description. */
export function suggestedPrompts(project: Pick<Project, "title" | "description">): string[] {
  const description = project.description?.trim();
  const topic = description
    ? description.length > DESCRIPTION_PREVIEW_MAX
      ? `${description.slice(0, DESCRIPTION_PREVIEW_MAX).trimEnd()}…`
      : description
    : project.title;
  return [
    `Suggest three CMF themes for ${project.title}`,
    `Which materials fit ${topic}?`,
    "What finishes would you avoid here?",
  ];
}
