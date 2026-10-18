import { MESSAGE_CONTENT_MAX, SendMessageRequestSchema } from "@lmesh/api-contract";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useComposerDraftStore } from "./composer-draft.store";
import { useStreamNotice } from "./stream-notice.store";
import { useIsStreaming } from "./use-is-streaming";
import { useSendMessage } from "./use-send-message";

const COUNTER_FROM = 3500;

/** Message input with Send/Stop (FSD 6.4). Enter sends, Shift+Enter adds a newline. */
export function Composer({ projectId }: { projectId: string }) {
  const { send, stop } = useSendMessage(projectId);
  const inlineError = useStreamNotice(projectId);
  const isStreaming = useIsStreaming(projectId);
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasStreaming = useRef(false);

  // Suggested prompts land here; consume each draft so it applies once.
  useEffect(
    () =>
      useComposerDraftStore.subscribe((state) => {
        const text = state.drafts[projectId];
        if (!text) return;
        setValue(text);
        state.setDraft(projectId, "");
        textareaRef.current?.focus();
      }),
    [projectId],
  );

  // Give focus back when a stream ends.
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) textareaRef.current?.focus();
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  const isTooLong = value.length > MESSAGE_CONTENT_MAX;
  const parsed = SendMessageRequestSchema.safeParse({ content: value });

  async function submit() {
    if (!parsed.success || isStreaming) return;
    const content = parsed.data.content;
    setValue("");
    const started = await send(content);
    if (!started) setValue((current) => current || content);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isStreaming) stop();
    else void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const describedBy = [
    value.length >= COUNTER_FROM ? "composer-count" : null,
    inlineError ? "composer-error" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {inlineError && (
          <p id="composer-error" role="alert" className="text-sm text-destructive">
            {inlineError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="composer-input" className="sr-only">
              Message
            </label>
            <Textarea
              id="composer-input"
              ref={textareaRef}
              value={value}
              rows={2}
              disabled={isStreaming}
              placeholder="Ask about colours, materials and finishes…"
              aria-invalid={isTooLong ? true : undefined}
              aria-describedby={describedBy || undefined}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              className="max-h-48 resize-none"
            />
            {value.length >= COUNTER_FROM && (
              <p
                id="composer-count"
                className={isTooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              >
                {value.length}/{MESSAGE_CONTENT_MAX}
                {isTooLong && ` – message is too long`}
              </p>
            )}
          </div>
          {isStreaming ? (
            <Button type="submit" variant="outline">
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!parsed.success}>
              Send
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
