import { useCallback } from "react";

import { useStreamRun } from "./use-stream-run";

/** Streams a summary of the active conversation into a new summary message. */
export function useSummarise(projectId: string) {
  const { run } = useStreamRun(projectId);
  return useCallback(
    () => run({ endpoint: "summarise", params: { projectId } }),
    [run, projectId],
  );
}
