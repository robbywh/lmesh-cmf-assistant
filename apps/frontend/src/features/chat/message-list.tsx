import type { Message } from "@lmesh/api-contract";

import { MessageItem } from "./message-item";
import { useAutoScroll } from "./use-auto-scroll";

interface MessageListProps {
  projectId: string;
  messages: Message[];
}

/** Scrollable conversation log (`role="log"`) that follows new content while streaming. */
export function MessageList({ projectId, messages }: MessageListProps) {
  const { containerRef, contentRef, onScroll } = useAutoScroll(messages.length);
  const lastAssistantId = messages.findLast((message) => message.role === "assistant")?.id;

  return (
    <div ref={containerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      <ul
        ref={contentRef}
        role="log"
        aria-label="Conversation"
        className="mx-auto flex max-w-3xl flex-col gap-4 p-4"
      >
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            projectId={projectId}
            message={message}
            isLastAssistant={message.id === lastAssistantId}
          />
        ))}
      </ul>
    </div>
  );
}
