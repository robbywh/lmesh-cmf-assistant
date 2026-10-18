import type { ActiveConversation } from "@lmesh/api-contract";
import { Injectable, Logger } from "@nestjs/common";

import {
  NotFoundException,
  StreamInProgressException,
} from "../common/exceptions";
import { lockProject } from "../common/database/lock-project.util";
import { isUniqueViolation } from "../common/database/unique-violation.util";
import { PrismaService } from "../prisma/prisma.service";
import { toActiveConversation } from "./conversation.mapper";
import { StaleStreamService } from "./stale-stream.service";

const MESSAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

/** Reads and resets a project's single active conversation. */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleStreams: StaleStreamService,
  ) {}

  /**
   * Returns the active conversation with its messages; stale `streaming`
   * messages are flipped to `error` / `AI_TIMEOUT` first (FR-CHAT-09).
   * @throws NotFoundException when the project is missing or not the caller's.
   */
  public async getActive(
    ownerId: string,
    projectId: string,
  ): Promise<ActiveConversation> {
    await this.assertOwned(ownerId, projectId);
    await this.staleStreams.markStale(this.prisma, { projectId });
    return this.loadActive(projectId);
  }

  /**
   * Archives the active conversation and starts a new empty one, atomically.
   * Concurrent resets that lose the race on the partial unique index resolve
   * to the conversation the winner created.
   * @throws NotFoundException when the project is missing or not the caller's.
   * @throws StreamInProgressException while a reply is still streaming.
   */
  public async reset(
    ownerId: string,
    projectId: string,
  ): Promise<ActiveConversation> {
    await this.assertOwned(ownerId, projectId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
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

        await tx.conversation.updateMany({
          where: { projectId, archivedAt: null },
          data: { archivedAt: new Date() },
        });
        return tx.conversation.create({ data: { projectId } });
      });
      this.logger.log(`Conversation reset for project ${projectId}`);
      return toActiveConversation(created, []);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      this.logger.warn(`Concurrent reset for project ${projectId}`);
      return this.loadActive(projectId);
    }
  }

  private async assertOwned(ownerId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");
  }

  private async loadActive(projectId: string): Promise<ActiveConversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { projectId, archivedAt: null },
      include: { messages: { orderBy: [...MESSAGE_ORDER] } },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    const { messages, ...row } = conversation;
    return toActiveConversation(row, messages);
  }
}
