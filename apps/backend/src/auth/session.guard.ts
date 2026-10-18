import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { IS_PUBLIC_KEY } from "../common/decorators";
import {
  ErrorCode,
  ServiceUnavailableException,
  UnauthorizedException,
} from "../common/exceptions";
import type { Auth } from "./auth.config";
import { AUTH } from "./auth.constants";
import type { AuthenticatedRequest } from "./auth.types";
import { toWebHeaders } from "./fastify-web-request.util";

/**
 * Global guard: every route needs a valid better-auth session unless it is
 * marked `@Public()`. The resolved `{ user, session }` is attached as `request.auth`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  /**
   * @param context Current execution context.
   * @returns True when the route is public or the session is valid.
   * @throws UnauthorizedException when there is no valid session.
   * @throws ServiceUnavailableException when the session lookup itself fails.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // 401 only when the lookup succeeded and found no session; a failing lookup is a 503.
    const session = await this.resolveSession(request);
    if (!session) throw new UnauthorizedException();

    (request as AuthenticatedRequest).auth = session;
    return true;
  }

  private async resolveSession(request: FastifyRequest) {
    try {
      return await this.auth.api.getSession({
        headers: toWebHeaders(request.headers),
      });
    } catch (error) {
      this.logger.error(
        `Session lookup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new ServiceUnavailableException(
        undefined,
        ErrorCode.SERVICE_UNAVAILABLE,
        error,
      );
    }
  }
}
