import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";

import { createQueryClient } from "@/lib/query-client";
import { createAppRouter, redirectToLogin, type AppRouter } from "@/router";

/** Renders the real router, providers and routes at `path` with an in-memory history. */
export function renderApp(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const queryClient = createQueryClient({
    retry: false,
    onUnauthorized: () => redirectToLogin(router),
  });
  const router: AppRouter = createAppRouter(queryClient, history);

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}
