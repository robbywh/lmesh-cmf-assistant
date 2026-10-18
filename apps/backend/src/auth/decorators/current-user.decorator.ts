import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest, AuthSession } from "../auth.types";

/** The signed-in user (`id`, `email`, `name`, ...) attached by `SessionGuard`. */
export type CurrentUserData = AuthSession["user"];

/** Injects the session user into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserData =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.user,
);
