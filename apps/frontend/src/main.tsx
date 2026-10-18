import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { apiMockingEnabled } from "@/lib/env";
import { createQueryClient } from "@/lib/query-client";
import { createAppRouter, redirectToLogin } from "@/router";

import "./index.css";

async function enableMocking(): Promise<void> {
  // `import.meta.env.DEV` is replaced by `false` in production builds, so the
  // dynamic import below is dropped and MSW never reaches the production bundle.
  if (!import.meta.env.DEV || !apiMockingEnabled) return;
  const { startMockWorker } = await import("@/mocks/browser");
  await startMockWorker();
}

const queryClient = createQueryClient({ onUnauthorized: () => redirectToLogin(router) });
const router = createAppRouter(queryClient);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

void enableMocking().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
