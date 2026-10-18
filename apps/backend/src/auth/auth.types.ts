import type { FastifyRequest } from "fastify";

import type { Auth } from "./auth.config";

/** Resolved better-auth session: the `session` row and its `user`. */
export type AuthSession = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>;

/** Fastify request after `SessionGuard` attached the session. */
export type AuthenticatedRequest = FastifyRequest & { auth: AuthSession };
