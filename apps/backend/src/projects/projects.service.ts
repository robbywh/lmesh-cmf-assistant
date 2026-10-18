import type {
  CreateProjectRequest,
  Project,
  UpdateProjectRequest,
} from "@lmesh/api-contract";
import { Injectable, Logger } from "@nestjs/common";

import {
  NotFoundException,
  StreamInProgressException,
} from "../common/exceptions";
import type { Project as ProjectRow } from "../generated/prisma/client";
import { StaleStreamService } from "../conversations/stale-stream.service";
import { lockProject } from "../common/database/lock-project.util";
import { PrismaService } from "../prisma/prisma.service";
import { toProject } from "./project.mapper";

/** Empty (already trimmed) descriptions are stored as `null`. */
const emptyToNull = (value: string | null | undefined): string | null =>
  value ? value : null;

/** Project use cases; every query is scoped to the owning user. */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleStreams: StaleStreamService,
  ) {}

  /**
   * @param ownerId Signed-in user's id.
   * @returns The user's projects, most recently updated first.
   */
  public async list(ownerId: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toProject);
  }

  /**
   * Creates a project together with its first active conversation (one atomic write).
   * @param ownerId Signed-in user's id.
   * @param input Validated request body.
   * @returns The created project.
   */
  public async create(
    ownerId: string,
    input: CreateProjectRequest,
  ): Promise<Project> {
    const row = await this.prisma.project.create({
      data: {
        ownerId,
        title: input.title,
        description: emptyToNull(input.description),
        conversations: { create: {} },
      },
    });
    this.logger.log(`Project ${row.id} created`);
    return toProject(row);
  }

  /**
   * @param ownerId Signed-in user's id.
   * @param projectId Project id.
   * @throws NotFoundException when missing or owned by someone else.
   */
  public async get(ownerId: string, projectId: string): Promise<Project> {
    return toProject(await this.findOwned(ownerId, projectId));
  }

  /**
   * Updates title and/or description; omitted fields are unchanged.
   * @throws NotFoundException when missing or owned by someone else.
   */
  public async update(
    ownerId: string,
    projectId: string,
    input: UpdateProjectRequest,
  ): Promise<Project> {
    await this.findOwned(ownerId, projectId);
    const row = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: emptyToNull(input.description) }
          : {}),
      },
    });
    return toProject(row);
  }

  /**
   * Deletes a project; conversations and messages cascade.
   * @throws NotFoundException when missing or owned by someone else.
   * @throws StreamInProgressException while a reply is streaming.
   */
  public async remove(ownerId: string, projectId: string): Promise<void> {
    await this.findOwned(ownerId, projectId);
    // One transaction with the project row locked: a concurrent send cannot slip a
    // streaming message in between the check and the delete.
    await this.prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      await this.staleStreams.markStale(tx, { projectId });
      const streaming = await tx.message.findFirst({
        where: {
          status: "streaming",
          conversation: { projectId, archivedAt: null },
        },
        select: { id: true },
      });
      if (streaming) throw new StreamInProgressException();

      await tx.project.delete({ where: { id: projectId } });
    });
    this.logger.log(`Project ${projectId} deleted`);
  }

  private async findOwned(
    ownerId: string,
    projectId: string,
  ): Promise<ProjectRow> {
    const row = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId },
    });
    if (!row) throw new NotFoundException("Project not found");
    return row;
  }
}
