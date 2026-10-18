import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE } from "./fixtures/paths.js";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

/**
 * The stack is owned by docker compose, so there is no `webServer` here;
 * `global-setup.ts` waits for it instead. One worker: the real AI is the
 * bottleneck and parallel streams make timing flaky.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      // Sign-in is rate limited; a retry must never burn extra attempts.
      retries: 0,
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Journeys reuse the signed-in session saved by the setup project.
      name: "chromium",
      testIgnore: [/auth\.setup\.ts/, /smoke\.spec\.ts/],
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
});
