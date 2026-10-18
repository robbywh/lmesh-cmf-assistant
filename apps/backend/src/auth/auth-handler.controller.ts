import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Public, RawResponse } from "../common/decorators";
import type { Auth } from "./auth.config";
import { AUTH } from "./auth.constants";
import { sendWebResponse, toWebRequest } from "./fastify-web-request.util";

/**
 * Catch-all bridge to better-auth (`/api/v1/auth/*`). Responses are better-auth's
 * own bodies, so they bypass the success envelope and the error filter.
 */
@ApiExcludeController()
@Controller({ path: "auth", version: "1" })
export class AuthHandlerController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  /**
   * Forwards any auth request to better-auth and relays its response.
   * @param request Incoming Fastify request.
   * @param reply Fastify reply written to directly.
   */
  @Public()
  @RawResponse()
  @All("*")
  public async handle(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const response = await this.auth.handler(toWebRequest(request));
    await sendWebResponse(response, reply);
  }
}
