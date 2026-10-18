import type { FullConfig } from "@playwright/test";

const HEALTH_PATH = "/api/v1/health";
const WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls the health endpoint through the frontend origin until it returns 200. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    throw new Error("e2e: no baseURL configured (set E2E_BASE_URL).");
  }

  const healthUrl = new URL(HEALTH_PATH, baseURL).toString();
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let lastProblem = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `e2e: ${healthUrl} did not return 200 within ${WAIT_TIMEOUT_MS / 1000}s (${lastProblem}). ` +
      "Start the stack first: docker compose up --build -d",
  );
}
