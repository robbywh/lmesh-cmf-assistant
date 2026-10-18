import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/features/auth/session-query";

/** Layout for every signed-in route; redirects to `/login?redirect=<href>` without a session. */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
});
