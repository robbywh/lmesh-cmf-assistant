import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginForm } from "@/features/auth/login-form";
import { sessionQueryOptions } from "@/features/auth/session-query";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/projects", replace: true });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTarget } = Route.useSearch();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginForm redirect={redirectTarget} />
    </main>
  );
}
