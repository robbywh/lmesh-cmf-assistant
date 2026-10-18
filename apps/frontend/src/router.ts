import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: "intent",
    // Let TanStack Query own caching; the router always re-runs loaders.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

/** Sends the user to `/login?redirect=<current href>` unless they are already there. */
export function redirectToLogin(router: AppRouter): Promise<void> {
  const { pathname, href } = router.state.location;
  if (pathname === "/login") return Promise.resolve();
  return router.navigate({ to: "/login", search: { redirect: href }, replace: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
