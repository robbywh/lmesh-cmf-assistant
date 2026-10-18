import {
  Body,
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
import { SendMessageDto } from "./dto/send-message.dto";

@ApiTags("chat")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller({ path: "projects/:projectId/messages", version: "1" })
export class MessagesController {
  constructor(private readonly chatStream: ChatStreamService) {}

  /** Saves the user message and streams the assistant's reply as SSE. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  @ApiProduces("text/event-stream")
  @ApiOperation({ summary: "Send a message and stream the assistant's reply" })
  @ApiOkResponse({
    description: STREAM_DESCRIPTION,
    content: { "text/event-stream": { schema: { type: "string" } } },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: "STREAM_IN_PROGRESS: a reply is already being generated",
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: "AI_UNAVAILABLE: the AI provider is not configured",
  })
  public async send(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
    @Body() body: SendMessageDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.chatStream.start({
      user,
      projectId: params.projectId,
      content: body.content,
      request,
      reply,
    });
  }
}
