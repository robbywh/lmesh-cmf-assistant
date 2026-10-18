import { useChatStreamStore } from "@/stores/chat-stream.store";

/** True while a stream is in flight for the project. Re-renders only when that flips. */
export function useIsStreaming(projectId: string): boolean {
  return useChatStreamStore((state) => projectId in state.streams);
}
