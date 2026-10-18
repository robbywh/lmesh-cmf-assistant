import {
  ErrorCode,
  ActiveConversationSchema,
  type ActiveConversation,
  type Message,
  type SseEvent,
} from "@lmesh/api-contract";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { conversationKey, projectsKey } from "@/features/projects/projects-queries";
import { apiRequest } from "@/lib/api-client";
import { ApiError, isApiError } from "@/lib/api-error";
import { useChatStreamStore } from "@/stores/chat-stream.store";

import { errorMessageFor } from "./error-messages";
import { streamChat, type StreamEndpoint } from "./stream-chat";
import { useStreamNoticeStore } from "./stream-notice.store";
import { streamTimings } from "./stream-timings";

export interface StreamRunRequest {
  endpoint: StreamEndpoint;
  params: Record<string, string>;
  body?: unknown;
}

const store = () => useChatStreamStore.getState();

function patchMessages(
  queryClient: QueryClient,
  projectId: string,
  update: (messages: Message[]) => Message[],
): void {
  queryClient.setQueryData<ActiveConversation>(conversationKey(projectId), (conversation) =>
    conversation ? { ...conversation, messages: update(conversation.messages) } : conversation,
  );
}

function replaceOrAppend(messages: Message[], message: Message): Message[] {
  return messages.some((existing) => existing.id === message.id)
    ? messages.map((existing) => (existing.id === message.id ? message : existing))
    : [...messages, message];
}

const INLINE_CODES: ReadonlySet<ErrorCode> = new Set([
  ErrorCode.STREAM_IN_PROGRESS,
  ErrorCode.MESSAGE_NOT_RETRYABLE,
  ErrorCode.NOTHING_TO_SUMMARISE,
]);

function isInlineCode(code: ErrorCode): boolean {
  return code.startsWith("AI_") || INLINE_CODES.has(code);
}

/** One pending resync per project; a newer stream or a reset cancels it. */
const resyncControllers = new Map<string, AbortController>();

/** Cancels the pending post-Stop resync of a project (new stream started, conversation reset). */
export function cancelResync(projectId: string): void {
  resyncControllers.get(projectId)?.abort();
  resyncControllers.delete(projectId);
}

/** Resolves false if `signal` aborts before `ms` elapsed. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Refetches the conversation after Stop. The local `aborted` row stays until the
 * server stops reporting the message as `streaming` (it would otherwise undo the
 * Stop). With no known message id (Stop before `message.created`) any `streaming`
 * row counts. If the server still says `streaming` after the last attempt, the
 * local row is kept and the conversation is invalidated once more later. Every
 * await is followed by a cancellation check, so a newer stream or a reset wins.
 */
async function resyncAfterStop(
  queryClient: QueryClient,
  projectId: string,
  messageId: string | null,
): Promise<void> {
  cancelResync(projectId);
  const controller = new AbortController();
  const { signal } = controller;
  resyncControllers.set(projectId, controller);
  const isStale = () => signal.aborted || projectId in store().streams;

  try {
    for (const delay of streamTimings.resyncDelaysMs) {
      if (!(await sleep(delay, signal)) || isStale()) return;
      let fresh: ActiveConversation;
      try {
        fresh = await apiRequest("getActiveConversation", {
          params: { projectId },
          schema: ActiveConversationSchema,
          signal,
        });
      } catch {
        continue; // Keep the local state and try again.
      }
      if (isStale()) return;
      const stillStreaming = fresh.messages.some(
        (message) =>
          message.status === "streaming" && (messageId === null || message.id === messageId),
      );
      if (!stillStreaming) {
        queryClient.setQueryData(conversationKey(projectId), fresh);
        return;
      }
    }
    if (!(await sleep(streamTimings.lateInvalidateMs, signal)) || isStale()) return;
    await queryClient.invalidateQueries({ queryKey: conversationKey(projectId) });
  } finally {
    if (resyncControllers.get(projectId) === controller) resyncControllers.delete(projectId);
  }
}

/** Cancels an in-flight conversation fetch so it cannot overwrite the patch that follows. */
async function patchMessagesSafely(
  queryClient: QueryClient,
  projectId: string,
  update: (messages: Message[]) => Message[],
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: conversationKey(projectId) });
  patchMessages(queryClient, projectId, update);
}

/**
 * Runs a streaming request (send, summarise or retry) and drives it into the
 * Query cache and the stream store (FSD 9.4). The work lives in the caches, not
 * in the component, so navigating away neither aborts nor duplicates a stream.
 * Pre-stream notices are published through {@link useStreamNoticeStore}.
 */
export function useStreamRun(projectId: string) {
  const queryClient = useQueryClient();
  const setNotice = useStreamNoticeStore((state) => state.setNotice);

  const finish = useCallback(() => {
    store().finish(projectId);
    void queryClient.invalidateQueries({ queryKey: projectsKey, exact: true });
  }, [projectId, queryClient]);

  const failLocally = useCallback(
    async (assistantMessageId: string, code: ErrorCode, content: string) => {
      await patchMessagesSafely(queryClient, projectId, (messages) =>
        messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content, status: "error", errorCode: code }
            : message,
        ),
      );
      finish();
    },
    [finish, projectId, queryClient],
  );

  const mutation = useMutation({
    /** Resolves when the stream ends; rejects only for pre-stream failures. */
    mutationFn: async ({ endpoint, params, body }: StreamRunRequest): Promise<void> => {
      const controller = new AbortController();
      cancelResync(projectId);
      store().start(projectId, controller);
      let assistantMessageId: string | null = null;
      let terminated = false;

      const apply = async (event: SseEvent): Promise<void> => {
        switch (event.type) {
          case "message.created": {
            const created = [event.userMessage, event.assistantMessage].filter(
              (message): message is Message => message !== null,
            );
            assistantMessageId = event.assistantMessage.id;
            await patchMessagesSafely(queryClient, projectId, (messages) =>
              created.reduce(replaceOrAppend, messages),
            );
            store().setAssistantMessage(projectId, assistantMessageId);
            break;
          }
          case "token":
            store().appendToken(projectId, event.delta, event.messageId);
            break;
          case "done":
            await patchMessagesSafely(queryClient, projectId, (messages) =>
              replaceOrAppend(messages, event.message),
            );
            terminated = true;
            finish();
            break;
          case "error": {
            const partial = store().streams[projectId]?.content ?? "";
            terminated = true;
            await failLocally(event.messageId, event.code, partial);
            break;
          }
        }
      };

      try {
        const events = await streamChat(endpoint, { params, body, signal: controller.signal });
        for await (const event of events) await apply(event);
        if (!terminated) throw ApiError.internal("Stream connection lost");
      } catch (error) {
        if (controller.signal.aborted) return; // Stop already handled the cache.
        if (assistantMessageId === null) {
          store().finish(projectId);
          throw error;
        }
        if (!terminated) {
          const partial = store().streams[projectId]?.content ?? "";
          await failLocally(assistantMessageId, ErrorCode.INTERNAL_ERROR, partial);
          void queryClient.invalidateQueries({ queryKey: conversationKey(projectId) });
        }
      }
    },
  });

  /** @returns false when the request failed before the stream started. */
  const run = useCallback(
    async (request: StreamRunRequest): Promise<boolean> => {
      setNotice(projectId, null);
      try {
        await mutation.mutateAsync(request);
        return true;
      } catch (error) {
        const code = isApiError(error) ? error.code : ErrorCode.INTERNAL_ERROR;
        if (isInlineCode(code)) setNotice(projectId, errorMessageFor(code));
        else toast.error(errorMessageFor(code));
        return false;
      }
    },
    [mutation, projectId, setNotice],
  );

  /** Stops the running stream and keeps the partial text as an `aborted` message. */
  const stop = useCallback(() => {
    const assistantMessageId = store().streams[projectId]?.assistantMessageId;
    const partial = store().abort(projectId);
    void queryClient.cancelQueries({ queryKey: conversationKey(projectId) });
    if (assistantMessageId) {
      patchMessages(queryClient, projectId, (messages) =>
        messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: partial, status: "aborted", errorCode: null }
            : message,
        ),
      );
    }
    // The server bumps updatedAt when it saves the partial message.
    void queryClient.invalidateQueries({ queryKey: projectsKey, exact: true });
    void resyncAfterStop(queryClient, projectId, assistantMessageId ?? null);
  }, [projectId, queryClient]);

  return { run, stop };
}
