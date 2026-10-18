import { createFileRoute } from "@tanstack/react-router";

import { NewProjectButton } from "@/features/projects/new-project-button";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsIndex,
});

function ProjectsIndex() {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="text-muted-foreground">Select a project or create a new one</p>
      <NewProjectButton />
    </div>
  );
}
