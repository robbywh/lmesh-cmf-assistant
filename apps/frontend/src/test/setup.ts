import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import type { StoreApi } from "zustand";
import { afterAll, afterEach, beforeAll } from "vitest";

import { useComposerDraftStore } from "@/features/chat/composer-draft.store";
import { useStreamNoticeStore } from "@/features/chat/stream-notice.store";
import { resetMockStore } from "@/mocks/mock-store";
import { server } from "@/mocks/server";
import { useChatStreamStore } from "@/stores/chat-stream.store";
import { useUiPreferencesStore } from "@/stores/ui-preferences.store";

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => undefined;
// Radix ScrollArea observes size changes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function resetStore<T>(store: StoreApi<T>): void {
  store.setState(store.getInitialState(), true);
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  toast.dismiss(); // sonner's toast list is module-global and would leak into the next test
  server.resetHandlers();
  resetMockStore();
  // Zustand stores outlive components; reset them so tests cannot leak state.
  resetStore(useUiPreferencesStore);
  resetStore(useChatStreamStore);
  resetStore(useComposerDraftStore);
  resetStore(useStreamNoticeStore);
});

afterAll(() => server.close());
