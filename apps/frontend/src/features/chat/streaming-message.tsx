import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { conversationKey } from "@/features/projects/projects-queries";
import { useChatStream } from "@/stores/chat-stream.store";

import { Markdown } from "./markdown";
import { streamTimings } from "./stream-timings";

interface StreamingBodyProps {
  projectId: string;
  messageId: string;
  /** Content saved on the server, shown when no local stream drives this message. */
  savedContent: string;
}

/**
 * Body of a `streaming` assistant message. Subscribes to this project's stream
 * only, so tokens re-render this component and nothing else in the list.
 */
export function StreamingBody({ projectId, messageId, savedContent }: StreamingBodyProps) {
  const stream = useChatStream(projectId);
  const isLocal = stream?.assistantMessageId === messageId;
  const content = isLocal ? stream.content : savedContent;
  const queryClient = useQueryClient();

  // Nothing local drives this row (another tab, a reload): poll so it cannot hang on "thinking".
  useEffect(() => {
    if (isLocal) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: conversationKey(projectId) });
    }, streamTimings.orphanPollMs);
    return () => clearInterval(timer);
  }, [isLocal, projectId, queryClient]);

  if (content === "") {
    return (
      <p data-testid="streaming-indicator" className="text-sm text-muted-foreground">
        Assistant is thinking…
      </p>
    );
  }
  return (
    <div aria-live="polite">
      <Markdown>{content}</Markdown>
      {isLocal && (
        <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground align-middle" />
      )}
    </div>
  );
}
