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
import { ProjectIdParamsDto } from "../projects/dto/project.dto";
import { ChatStreamService } from "./chat-stream.service";
import { STREAM_DESCRIPTION } from "./stream-docs.constants";

@ApiTags("chat")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller({ path: "projects/:projectId/summaries", version: "1" })
export class SummariesController {
  constructor(private readonly chatStream: ChatStreamService) {}

  /** Streams a summary of the key design decisions as a `kind = summary` message. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  @ApiProduces("text/event-stream")
  @ApiOperation({ summary: "Summarise the key design decisions (streamed)" })
  @ApiOkResponse({
    description: `${STREAM_DESCRIPTION}\n\`userMessage\` in \`message.created\` is null.`,
    content: { "text/event-stream": { schema: { type: "string" } } },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      "STREAM_IN_PROGRESS: a reply is being generated; NOTHING_TO_SUMMARISE: no assistant reply yet",
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: "AI_UNAVAILABLE: the AI provider is not configured",
  })
  public async summarise(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.chatStream.startSummary({
      user,
      projectId: params.projectId,
      request,
      reply,
    });
  }
}
