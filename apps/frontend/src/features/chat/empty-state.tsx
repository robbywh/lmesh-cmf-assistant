import type { Project } from "@lmesh/api-contract";

import { Button } from "@/components/ui/button";

import { suggestedPrompts } from "./suggested-prompts";

interface EmptyStateProps {
  project: Pick<Project, "title" | "description">;
  onSuggest: (text: string) => void;
}

/** Intro and suggested prompts for a conversation without messages. */
export function EmptyState({ project, onSuggest }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">Start the conversation</h2>
      <p className="text-sm text-muted-foreground">
        Ask about colours, materials and finishes for this project. Try one of these:
      </p>
      <ul className="flex w-full flex-col gap-2">
        {suggestedPrompts(project).map((prompt) => (
          <li key={prompt}>
            <Button variant="outline" className="h-auto w-full whitespace-normal py-2" onClick={() => onSuggest(prompt)}>
              {prompt}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
