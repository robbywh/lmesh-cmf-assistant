import type { Message } from "@lmesh/api-contract";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { errorMessageFor } from "./error-messages";
import { Markdown } from "./markdown";
import { StreamingBody } from "./streaming-message";
import { useIsStreaming } from "./use-is-streaming";
import { useRetryMessage } from "./use-retry-message";

interface MessageItemProps {
  projectId: string;
  message: Message;
  /** True for the last assistant message: the only one that offers Retry. */
  isLastAssistant: boolean;
}

function RetryButton({ projectId, messageId }: { projectId: string; messageId: string }) {
  const retry = useRetryMessage(projectId);
  const isStreaming = useIsStreaming(projectId);
  return (
    <Button variant="outline" size="sm" disabled={isStreaming} onClick={() => void retry(messageId)}>
      Retry
    </Button>
  );
}

function AssistantBody({ projectId, message, isLastAssistant }: MessageItemProps) {
  const { status, content, errorCode } = message;
  const showRetry = isLastAssistant && (status === "error" || status === "aborted");

  return (
    <>
      {status === "streaming" ? (
        <StreamingBody projectId={projectId} messageId={message.id} savedContent={content} />
      ) : (
        content !== "" && <Markdown>{content}</Markdown>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessageFor(errorCode)}
        </p>
      )}
      {status === "aborted" && <p className="mt-2 text-xs text-muted-foreground">Stopped</p>}
      {showRetry && (
        <div className="mt-2">
          <RetryButton projectId={projectId} messageId={message.id} />
        </div>
      )}
    </>
  );
}

/** One message row (FSD 6.4). Presentational: all data comes through props. */
export const MessageItem = memo(function MessageItem({
  projectId,
  message,
  isLastAssistant,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isSummary = message.kind === "summary";

  return (
    <li
      data-testid="message-item"
      data-role={message.role}
      data-kind={message.kind}
      data-status={message.status}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      {isUser ? (
        <p className="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </p>
      ) : isSummary ? (
        <section
          aria-label="Summary"
          className="w-full max-w-[85%] rounded-lg border bg-card p-4 text-sm text-card-foreground"
        >
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Summary
          </h3>
          <AssistantBody
            projectId={projectId}
            message={message}
            isLastAssistant={isLastAssistant}
          />
        </section>
      ) : (
        <div className="max-w-[85%] text-sm">
          <AssistantBody
            projectId={projectId}
            message={message}
            isLastAssistant={isLastAssistant}
          />
        </div>
      )}
    </li>
  );
});
