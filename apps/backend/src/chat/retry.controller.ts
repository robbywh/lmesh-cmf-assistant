import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  CurrentUser,
  type CurrentUserData,
} from "../auth/decorators/current-user.decorator";
import { RawResponse } from "../common/decorators";
import { ErrorResponseDto } from "../common/dto/error-response.dto";
import { ChatStreamService } from "./chat-stream.service";
import { MessageIdParamsDto } from "./dto/message-id-params.dto";
import { STREAM_DESCRIPTION } from "./stream-docs.constants";

@ApiTags("chat")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller({ path: "messages/:messageId/retry", version: "1" })
export class RetryController {
  constructor(private readonly chatStream: ChatStreamService) {}

  /** Regenerates the last failed or aborted assistant message in place (same id). */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  @ApiProduces("text/event-stream")
  @ApiOperation({
    summary: "Retry a failed or aborted assistant message (streamed)",
  })
  @ApiOkResponse({
    description: `${STREAM_DESCRIPTION}\n\`userMessage\` in \`message.created\` is null; \`assistantMessage\` is the same message id, reset to streaming.`,
    content: { "text/event-stream": { schema: { type: "string" } } },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      "STREAM_IN_PROGRESS: a reply is being generated; MESSAGE_NOT_RETRYABLE: not the last failed or aborted reply of the active conversation",
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: "AI_UNAVAILABLE: the AI provider is not configured",
  })
  public async retry(
    @CurrentUser() user: CurrentUserData,
    @Param() params: MessageIdParamsDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.chatStream.startRetry({
      user,
      messageId: params.messageId,
      request,
      reply,
    });
  }
}
