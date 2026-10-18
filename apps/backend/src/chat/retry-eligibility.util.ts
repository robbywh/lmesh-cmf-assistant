import type { MessageRole, MessageStatus } from "@lmesh/api-contract";

export interface RetryCandidate {
  role: MessageRole;
  status: MessageStatus;
  /** True when the message belongs to an archived (reset) conversation. */
  conversationArchived: boolean;
  /** True when any message was created after this one in its conversation. */
  hasLaterMessages: boolean;
}

/**
 * Only the last message of the active conversation can be retried, and only if it
 * is an assistant message that ended in `error` or `aborted` (FR-CHAT-07).
 * @param candidate The message and its position in its conversation.
 */
export function isRetryable(candidate: RetryCandidate): boolean {
  return (
    candidate.role === "assistant" &&
    (candidate.status === "error" || candidate.status === "aborted") &&
    !candidate.conversationArchived &&
    !candidate.hasLaterMessages
  );
}
