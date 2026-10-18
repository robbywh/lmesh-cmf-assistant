import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";

import { trustedOrigins } from "../../auth/auth.config";
import type { EnvironmentVariables } from "../../config/env.validation";
import { ForbiddenException } from "../exceptions";

const MUTATING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * CSRF defence for cookie auth: a state-changing request that carries an `Origin`
 * outside the allowed list is rejected with 403. Browsers always send `Origin` on
 * cross-site POSTs, so this also covers body-less POSTs that CORS preflight and
 * `SameSite=Lax` alone do not. Requests without `Origin` (curl, server-to-server)
 * are allowed: they cannot ride a victim's browser session.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly logger = new Logger(OriginGuard.name);
  private readonly allowed: ReadonlySet<string>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.allowed = new Set(
      trustedOrigins({
        corsOrigin: config.get("CORS_ORIGIN", { infer: true }),
        baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
      }),
    );
  }

  /**
   * @param context Current execution context.
   * @returns True when the method is safe, there is no Origin, or the Origin is allowed.
   * @throws ForbiddenException for a mutating request from a foreign Origin.
   */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!MUTATING_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin === undefined || this.allowed.has(origin)) return true;

    this.logger.warn(
      `Rejected ${request.method} ${request.url} from origin ${origin}`,
    );
    throw new ForbiddenException("Origin not allowed");
  }
}
