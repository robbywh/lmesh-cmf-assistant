import { create } from "zustand";

/** In-flight stream of one project (FSD 9.4). Server data stays in TanStack Query. */
export interface ChatStream {
  /** Set from `message.created`; `null` until then. */
  assistantMessageId: string | null;
  /** Text received so far. */
  content: string;
  /** `waiting` until the first token arrives. */
  phase: "waiting" | "streaming";
  abortController: AbortController;
}

interface ChatStreamState {
  streams: Record<string, ChatStream>;
  /** Starts tracking a stream; aborts a previous stream of the same project. */
  start: (projectId: string, abortController: AbortController) => void;
  setAssistantMessage: (projectId: string, assistantMessageId: string) => void;
  /** Ignored when `messageId` differs from the entry's assistant message (stale event). */
  appendToken: (projectId: string, delta: string, messageId?: string) => void;
  /** Removes the entry after `done` or `error`. */
  finish: (projectId: string) => void;
  /**
   * Aborts the request and removes the entry.
   * @returns The partial content so the caller can cache it as `aborted`.
   */
  abort: (projectId: string) => string;
}

function updateStream(
  streams: Record<string, ChatStream>,
  projectId: string,
  update: (stream: ChatStream) => ChatStream,
): Record<string, ChatStream> {
  const stream = streams[projectId];
  return stream ? { ...streams, [projectId]: update(stream) } : streams;
}

export const useChatStreamStore = create<ChatStreamState>()((set, get) => ({
  streams: {},

  start: (projectId, abortController) => {
    // A new stream replaces the old one; never leave the previous request running.
    get().streams[projectId]?.abortController.abort();
    set((state) => ({
      streams: {
        ...state.streams,
        [projectId]: {
          assistantMessageId: null,
          content: "",
          phase: "waiting",
          abortController,
        },
      },
    }));
  },

  setAssistantMessage: (projectId, assistantMessageId) =>
    set((state) => ({
      streams: updateStream(state.streams, projectId, (stream) => ({
        ...stream,
        assistantMessageId,
      })),
    })),

  appendToken: (projectId, delta, messageId) =>
    set((state) => ({
      streams: updateStream(state.streams, projectId, (stream) =>
        messageId !== undefined &&
        stream.assistantMessageId !== null &&
        stream.assistantMessageId !== messageId
          ? stream
          : { ...stream, content: stream.content + delta, phase: "streaming" },
      ),
    })),

  finish: (projectId) =>
    set((state) => {
      const { [projectId]: _removed, ...rest } = state.streams;
      return { streams: rest };
    }),

  abort: (projectId) => {
    const stream = get().streams[projectId];
    if (!stream) return "";
    stream.abortController.abort();
    get().finish(projectId);
    return stream.content;
  },
}));

/** Subscribes to one project's stream only; other projects' tokens do not re-render the caller. */
export function useChatStream(projectId: string): ChatStream | undefined {
  return useChatStreamStore((state) => state.streams[projectId]);
}
