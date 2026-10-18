import { useCallback, useEffect, useRef } from "react";

const STICK_THRESHOLD_PX = 80;

/**
 * Keeps a scroll container pinned to the bottom while its content grows,
 * unless the user scrolled up more than {@link STICK_THRESHOLD_PX}; scrolling
 * back near the bottom resumes following.
 * @param trigger Value that changes when new content is added (e.g. message count).
 */
export function useAutoScroll(trigger: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLUListElement>(null);
  const isPinned = useRef(true);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container && isPinned.current) container.scrollTop = container.scrollHeight;
  }, []);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    isPinned.current = distance <= STICK_THRESHOLD_PX;
  }, []);

  useEffect(scrollToBottom, [trigger, scrollToBottom]);

  // Streaming text grows the list without changing `trigger`.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  return { containerRef, contentRef, onScroll };
}
