import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";
import { mockStore } from "./mock-store";

/** Slow enough that streamed text visibly grows in the dev UI. */
const BROWSER_TOKEN_DELAY_MS = 40;

export const worker = setupWorker(...handlers);

/** Starts the mock service worker for `VITE_API_MOCKING=true` dev sessions. */
export async function startMockWorker(): Promise<void> {
  mockStore.tokenDelayMs = BROWSER_TOKEN_DELAY_MS;
  await worker.start({ onUnhandledFrame: "bypass" });
}
