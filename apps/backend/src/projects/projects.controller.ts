import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Project } from "@lmesh/api-contract";

import {
  CurrentUser,
  type CurrentUserData,
} from "../auth/decorators/current-user.decorator";
import { ErrorResponseDto } from "../common/dto/error-response.dto";
import { RawResponse } from "../common/decorators";
import {
  CreateProjectDto,
  ProjectIdParamsDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from "./dto/project.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("projects")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller({ path: "projects", version: "1" })
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** @returns The user's projects, most recently updated first. */
  @Get()
  @ApiOperation({ summary: "List my projects (updatedAt descending)" })
  @ApiOkResponse({ type: ProjectListResponseDto })
  public list(@CurrentUser() user: CurrentUserData): Promise<Project[]> {
    return this.projects.list(user.id);
  }

  /** @returns The created project (also creates its first conversation). */
  @Post()
  @ApiOperation({ summary: "Create a project" })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  public create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateProjectDto,
  ): Promise<Project> {
    return this.projects.create(user.id, body);
  }

  /** @returns The project, or 404 if it is not the caller's. */
  @Get(":projectId")
  @ApiOperation({ summary: "Get a project" })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  public get(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
  ): Promise<Project> {
    return this.projects.get(user.id, params.projectId);
  }

  /** @returns The updated project. */
  @Patch(":projectId")
  @ApiOperation({ summary: "Update a project's title and/or description" })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  public update(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
    @Body() body: UpdateProjectDto,
  ): Promise<Project> {
    return this.projects.update(user.id, params.projectId, body);
  }

  /** Deletes the project and, by cascade, its conversations and messages. */
  @Delete(":projectId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RawResponse()
  @ApiOperation({ summary: "Delete a project" })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: "STREAM_IN_PROGRESS: a reply is still streaming",
  })
  public remove(
    @CurrentUser() user: CurrentUserData,
    @Param() params: ProjectIdParamsDto,
  ): Promise<void> {
    return this.projects.remove(user.id, params.projectId);
  }
}
