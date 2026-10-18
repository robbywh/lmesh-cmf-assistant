import type { ActiveConversation } from "@lmesh/api-contract";
import { Controller, Get, Param, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import {
  CurrentUser,
  type CurrentUserData,
} from "../auth/decorators/current-user.decorator";
import { ErrorResponseDto } from "../common/dto/error-response.dto";
import { ProjectIdParamsDto } from "../projects/dto/project.dto";
import { ActiveConversationResponseDto } from "./dto/conversation.dto";
import { ConversationsService } from "./conversations.service";

@ApiTags("conversations")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiBadRequestResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({ type: ErrorResponseDto })
@Controller({ path: "projects/:projectId/conversations", version: "1" })
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /** @returns The project's active conversation with its messages. */
  @Get("active")
  @ApiOperation({ summary: "Get the active conversation" })
  @ApiOkResponse({ type: ActiveConversationResponseDto })
  public getActive(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
  ): Promise<ActiveConversation> {
    return this.conversations.getActive(user.id, params.projectId);
  }

  /** @returns A new, empty active conversation (the old one is archived). */
  @Post()
  @ApiOperation({ summary: "Reset the conversation (archive and start fresh)" })
  @ApiCreatedResponse({ type: ActiveConversationResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: "STREAM_IN_PROGRESS: a reply is still streaming",
  })
  public reset(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
  ): Promise<ActiveConversation> {
    return this.conversations.reset(user.id, params.projectId);
  }
}
