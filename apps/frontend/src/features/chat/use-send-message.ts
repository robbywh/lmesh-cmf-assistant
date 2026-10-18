import { useCallback } from "react";

import { useStreamRun } from "./use-stream-run";

/** Sends a chat message. `send` resolves false when the request failed before streaming. */
export function useSendMessage(projectId: string) {
  const { run, stop } = useStreamRun(projectId);
  const send = useCallback(
    (content: string) =>
      run({ endpoint: "sendMessage", params: { projectId }, body: { content } }),
    [run, projectId],
  );
  return { send, stop };
}
