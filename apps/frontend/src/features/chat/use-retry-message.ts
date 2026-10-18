import { useCallback } from "react";

import { useStreamRun } from "./use-stream-run";

/** Re-runs a failed or stopped assistant message; the server reuses its id, so the row is replaced in place. */
export function useRetryMessage(projectId: string) {
  const { run } = useStreamRun(projectId);
  return useCallback(
    (messageId: string) => run({ endpoint: "retryMessage", params: { messageId } }),
    [run],
  );
}
