import type { OutgoingHttpHeaders } from "node:http";

import type { ErrorCode, Message } from "@lmesh/api-contract";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AiChatMessage, AiProvider } from "../ai/ai-provider.interface";
import { AI_PROVIDER } from "../ai/ai.constants";
import { lockProject } from "../common/database/lock-project.util";
import { isUniqueViolation } from "../common/database/unique-violation.util";
import {
  AiTimeoutException,
  AiUnavailableException,
  ClientDisconnectedException,
  MessageNotRetryableException,
  NotFoundException,
  NothingToSummariseException,
  OperationAbortedException,
  StreamInProgressException,
} from "../common/exceptions";
import {
  type EnvironmentVariables,
  NodeEnvironment,
} from "../config/env.validation";
import { toMessage } from "../conversations/message.mapper";
import { StaleStreamService } from "../conversations/stale-stream.service";
import type { Message as MessageRow, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { buildPromptMessages } from "./history-window.util";
import { type PromptProject, SUMMARY_INSTRUCTION } from "./prompts.util";
import { isRetryable } from "./retry-eligibility.util";
import { SseWriter } from "./sse-writer.util";
import { classifyFailure, SAFE_ERROR_MESSAGES } from "./stream-failure.util";

const HEARTBEAT_MS = 15_000;

export interface StartStreamParams {
  user: { id: string };
  projectId: string;
  content: string;
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface ProjectStreamParams {
  user: { id: string };
  projectId: string;
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface RetryStreamParams {
  user: { id: string };
  messageId: string;
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface RunStreamParams {
  projectId: string;
  /** The saved placeholder: `assistant`, `chat`/`summary`, status `streaming`. */
  assistantMessage: MessageRow;
  /** Messages sent to the provider (system prompt first). */
  history: AiChatMessage[];
  writer: SseWriter;
  /** Aborts when the client disconnects. */
  clientSignal: AbortSignal;
}

/**
 * Runs AI replies as SSE streams: pre-stream checks and inserts as JSON errors,
 * then (after hijacking the reply) tokens, timeouts, abort handling and the final
 * save. `runStream` is the reusable core for send, summarise and retry.
 */
@Injectable()
export class ChatStreamService {
  private readonly logger = new Logger(ChatStreamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleStreams: StaleStreamService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  /**
   * Handles `POST /projects/:projectId/messages`: validates, saves the user
   * message and an assistant placeholder, then streams the reply.
   * Everything before the first byte throws normal exceptions (JSON errors);
   * after the reply is hijacked this method never throws.
   * @throws NotFoundException for a missing or foreign project.
   * @throws AiUnavailableException when the provider is not configured.
   * @throws StreamInProgressException when a reply is already streaming.
   */
  public async start(params: StartStreamParams): Promise<void> {
    const { user, projectId, content, request, reply } = params;

    const project = await this.findProjectForStream(user.id, projectId);
    const clientSignal = this.watchClient(request, reply);

    const { userMessage, assistantMessage } = await this.insertMessages(
      projectId,
      content,
    );
    await this.streamReply({
      project,
      projectId,
      userMessage,
      assistantMessage,
      reply,
      clientSignal,
    });
  }

  /**
   * Handles `POST /projects/:projectId/summaries`: streams a summary of the
   * active conversation into a new `kind = summary` assistant message.
   * @throws NotFoundException for a missing or foreign project.
   * @throws AiUnavailableException when the provider is not configured.
   * @throws NothingToSummariseException before the assistant has replied.
   * @throws StreamInProgressException when a reply is already streaming.
   */
  public async startSummary(params: ProjectStreamParams): Promise<void> {
    const { user, projectId, request, reply } = params;
    const project = await this.findProjectForStream(user.id, projectId);
    const clientSignal = this.watchClient(request, reply);
    const assistantMessage = await this.insertSummaryPlaceholder(projectId);
    await this.streamReply({
      project,
      projectId,
      userMessage: null,
      assistantMessage,
      instruction: SUMMARY_INSTRUCTION,
      reply,
      clientSignal,
    });
  }

  /**
   * Handles `POST /messages/:messageId/retry`: regenerates the last failed or
   * aborted assistant message in place (same id) with its original history.
   * @throws NotFoundException for a missing or foreign message.
   * @throws AiUnavailableException when the provider is not configured.
   * @throws MessageNotRetryableException unless it is the last failed/aborted reply.
   * @throws StreamInProgressException when a reply is already streaming.
   */
  public async startRetry(params: RetryStreamParams): Promise<void> {
    const { user, messageId, request, reply } = params;
    const target = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { project: { ownerId: user.id } } },
      select: { kind: true, conversation: { select: { projectId: true } } },
    });
    if (!target) throw new NotFoundException("Message not found");
    const projectId = target.conversation.projectId;
    const project = await this.findProjectForStream(user.id, projectId);
    const clientSignal = this.watchClient(request, reply);

    const assistantMessage = await this.resetForRetry(messageId, projectId);
    await this.streamReply({
      project,
      projectId,
      userMessage: null,
      assistantMessage,
      instruction: target.kind === "summary" ? SUMMARY_INSTRUCTION : undefined,
      reply,
      clientSignal,
    });
  }

  private async findProjectForStream(
    ownerId: string,
    projectId: string,
  ): Promise<PromptProject> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId },
      select: { title: true, description: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    if (!this.provider.isConfigured()) {
      throw new AiUnavailableException("The AI service is not configured");
    }
    return project;
  }

  /**
   * Builds the prompt, takes over the response, announces the message(s) and streams.
   * A failure before the response is taken over saves the placeholder as
   * `error`/`INTERNAL_ERROR` and is rethrown (JSON 500); afterwards nothing is thrown.
   */
  private async streamReply(args: {
    project: PromptProject;
    projectId: string;
    userMessage: MessageRow | null;
    assistantMessage: MessageRow;
    instruction?: string;
    reply: FastifyReply;
    clientSignal: AbortSignal;
  }): Promise<void> {
    const { project, projectId, userMessage, assistantMessage, clientSignal } =
      args;

    if (clientSignal.aborted) {
      // The client left before any byte was written: no provider call, row saved aborted.
      args.reply.hijack();
      await this.discardAborted(projectId, assistantMessage);
      return;
    }

    let history: AiChatMessage[];
    let writer: SseWriter;
    try {
      history = buildPromptMessages({
        project,
        messages: await this.loadHistory(assistantMessage),
        maxMessages: this.config.get("AI_HISTORY_MAX_MESSAGES", {
          infer: true,
        }),
        maxChars: this.config.get("AI_HISTORY_MAX_CHARS", { infer: true }),
        instruction: args.instruction,
      });
      writer = this.openStream(args.reply);
    } catch (error) {
      await this.failPlaceholder(assistantMessage);
      throw error;
    }

    try {
      writer.event({
        type: "message.created",
        userMessage: userMessage ? toMessage(userMessage) : null,
        assistantMessage: toMessage(assistantMessage),
      });
    } catch (error) {
      this.logger.error(
        `Failed to announce message ${assistantMessage.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.failPlaceholder(assistantMessage);
      writer.close();
      return;
    }

    await this.runStream({
      projectId,
      assistantMessage,
      history,
      writer,
      clientSignal,
    });
  }

  /** Saves a placeholder that never started streaming as `error`/`INTERNAL_ERROR` (best effort). */
  private async failPlaceholder(assistantMessage: MessageRow): Promise<void> {
    try {
      await this.prisma.message.updateMany({
        where: { id: assistantMessage.id, status: "streaming" },
        data: { status: "error", errorCode: "INTERNAL_ERROR" },
      });
    } catch (error) {
      this.logger.error(
        `Could not mark message ${assistantMessage.id} as failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Saves a placeholder whose client disconnected before streaming began as `aborted`. */
  private async discardAborted(
    projectId: string,
    assistantMessage: MessageRow,
  ): Promise<void> {
    try {
      await this.saveOutcome(projectId, assistantMessage.id, {
        content: "",
        status: "aborted",
        errorCode: null,
      });
    } catch (error) {
      this.logger.error(
        `Could not mark message ${assistantMessage.id} as aborted`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Streams the provider's reply into the placeholder and saves the outcome.
   * Never throws: every failure ends in a saved `error`/`aborted` message.
   * Ends with `done` or `error` (nothing on client abort) and closes the writer.
   */
  public async runStream(params: RunStreamParams): Promise<void> {
    const { projectId, assistantMessage, history, writer, clientSignal } =
      params;
    const controller = new AbortController();
    const { signal } = controller;
    const abort = (reason: unknown): void => {
      if (!signal.aborted) controller.abort(reason);
    };
    const onClientGone = (): void => abort(new ClientDisconnectedException());
    if (clientSignal.aborted) onClientGone();
    clientSignal.addEventListener("abort", onClientGone, { once: true });

    const firstTokenTimer = setTimeout(
      () => abort(new AiTimeoutException()),
      this.config.get("AI_FIRST_TOKEN_TIMEOUT_MS", { infer: true }),
    );
    const totalTimer = setTimeout(
      () => abort(new AiTimeoutException()),
      this.config.get("AI_REQUEST_TIMEOUT_MS", { infer: true }),
    );
    const heartbeat = setInterval(() => writer.comment("ping"), HEARTBEAT_MS);

    let buffer = "";
    let failure: ReturnType<typeof classifyFailure> | null = null;
    const startedAt = Date.now();
    try {
      for await (const delta of this.iterate(
        history,
        signal,
        assistantMessage.id,
      )) {
        clearTimeout(firstTokenTimer);
        buffer += delta;
        writer.event({
          type: "token",
          messageId: assistantMessage.id,
          delta,
        });
      }
    } catch (error) {
      failure = classifyFailure(error, signal);
      if (failure.kind === "error" && failure.unexpected) {
        this.logger.error(
          `Unexpected stream error for message ${assistantMessage.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(totalTimer);
      clearInterval(heartbeat);
      clientSignal.removeEventListener("abort", onClientGone);
    }

    await this.finish({
      projectId,
      assistantMessage,
      content: buffer,
      failure,
      writer,
      durationMs: Date.now() - startedAt,
    });
  }

  private async finish(args: {
    projectId: string;
    assistantMessage: MessageRow;
    content: string;
    failure: ReturnType<typeof classifyFailure> | null;
    writer: SseWriter;
    durationMs: number;
  }): Promise<void> {
    const { projectId, assistantMessage, content, failure, writer } = args;
    const status = !failure
      ? "complete"
      : failure.kind === "aborted"
        ? "aborted"
        : "error";
    const errorCode = failure?.kind === "error" ? failure.code : null;

    try {
      // Save + project touch in one transaction. Only a row that is still streaming may be
      // finished: a run that lost a race (a newer retry) or whose row was already flipped to
      // stale/error must not overwrite that result.
      const saved = await this.saveOutcome(projectId, assistantMessage.id, {
        content,
        status,
        errorCode,
      });
      if (!saved) {
        this.logger.warn(
          `Message ${assistantMessage.id} is no longer streaming; discarding this run's result (${status})`,
        );
        // Never a misleading `done`: tell a still-connected client to resync.
        writer.event(this.errorEvent(assistantMessage.id, "INTERNAL_ERROR"));
        return;
      }

      if (status === "complete") {
        writer.event({ type: "done", message: toMessage(saved) });
      } else if (errorCode) {
        writer.event(this.errorEvent(saved.id, errorCode));
      }
      this.logger.log(
        `stream message=${assistantMessage.id} status=${status}${errorCode ? ` code=${errorCode}` : ""} durationMs=${args.durationMs}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save stream result for message ${assistantMessage.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      // One more try with the smallest possible write, so the row does not stay `streaming`.
      await this.failPlaceholder(assistantMessage);
      writer.event(this.errorEvent(assistantMessage.id, "INTERNAL_ERROR"));
    } finally {
      writer.close();
    }
  }

  /**
   * Writes the final state of a message and touches the project, atomically, but only
   * while the message is still `streaming`.
   * @returns The saved row, or null when the message was no longer streaming.
   */
  private saveOutcome(
    projectId: string,
    messageId: string,
    data: {
      content: string;
      status: MessageRow["status"];
      errorCode: string | null;
    },
  ): Promise<MessageRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.message.updateMany({
        where: { id: messageId, status: "streaming" },
        data,
      });
      if (count === 0) return null;
      await this.touch(tx, projectId);
      return tx.message.findUniqueOrThrow({ where: { id: messageId } });
    });
  }

  private errorEvent(messageId: string, code: ErrorCode) {
    return {
      type: "error" as const,
      messageId,
      code,
      message:
        SAFE_ERROR_MESSAGES[code] ?? SAFE_ERROR_MESSAGES["INTERNAL_ERROR"]!,
    };
  }

  /** Provider deltas, but a timeout/abort wins even if the provider ignores the signal. */
  private async *iterate(
    history: AiChatMessage[],
    signal: AbortSignal,
    messageId: string,
  ): AsyncGenerator<string> {
    // Already aborted (the client left before we started): never call the provider.
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new OperationAbortedException();
    }
    const iterator = this.provider
      .streamChat(history, { signal, messageId })
      [Symbol.asyncIterator]();
    const abortError = (): Error =>
      signal.reason instanceof Error
        ? signal.reason
        : new OperationAbortedException();
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(abortError());
      else
        signal.addEventListener("abort", () => reject(abortError()), {
          once: true,
        });
    });
    aborted.catch(() => undefined);

    try {
      for (;;) {
        const next = iterator.next();
        next.catch(() => undefined);
        const result = await Promise.race([next, aborted]);
        if (result.done) return;
        if (result.value) yield result.value;
      }
    } finally {
      void Promise.resolve(iterator.return?.()).catch(() => undefined);
    }
  }

  private async insertSummaryPlaceholder(
    projectId: string,
  ): Promise<MessageRow> {
    return this.inTransaction(async (tx) => {
      await lockProject(tx, projectId);
      const conversation = await this.activeConversation(tx, projectId);
      await this.staleStreams.markStale(tx, {
        conversationId: conversation.id,
      });
      await this.assertNoStreaming(tx, conversation.id);
      const hasReply = await tx.message.findFirst({
        where: {
          conversationId: conversation.id,
          role: "assistant",
          kind: "chat",
          status: "complete",
        },
        select: { id: true },
      });
      if (!hasReply) throw new NothingToSummariseException();

      const placeholder = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          kind: "summary",
          content: "",
          status: "streaming",
          createdAt: new Date(),
        },
      });
      await this.touch(tx, projectId);
      return placeholder;
    });
  }

  private async resetForRetry(
    messageId: string,
    projectId: string,
  ): Promise<MessageRow> {
    return this.inTransaction(async (tx) => {
      await lockProject(tx, projectId);
      const message = await tx.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: { select: { projectId: true, archivedAt: true } },
        },
      });
      if (!message) throw new NotFoundException("Message not found");
      await this.staleStreams.markStale(tx, {
        conversationId: message.conversationId,
      });
      await this.assertNoStreaming(tx, message.conversationId, message.id);

      // Re-read after the stale flip: a stale streaming reply becomes retryable.
      const current = await tx.message.findUniqueOrThrow({
        where: { id: messageId },
      });
      // The message itself is streaming right now (a concurrent retry won): not "not retryable".
      if (current.status === "streaming") throw new StreamInProgressException();
      const later = await tx.message.findFirst({
        where: {
          conversationId: current.conversationId,
          OR: [
            { createdAt: { gt: current.createdAt } },
            { createdAt: current.createdAt, id: { gt: current.id } },
          ],
        },
        select: { id: true },
      });
      if (
        !isRetryable({
          role: current.role,
          status: current.status,
          conversationArchived: message.conversation.archivedAt !== null,
          hasLaterMessages: later !== null,
        })
      ) {
        throw new MessageNotRetryableException();
      }

      // Conditional reset: under READ COMMITTED two concurrent retries both pass the
      // checks above, but the loser's UPDATE re-evaluates the status once the winner
      // commits, matches nothing, and gets a 409 (one row, so the unique index can't help).
      const { count } = await tx.message.updateMany({
        where: { id: messageId, status: { in: ["error", "aborted"] } },
        data: { content: "", status: "streaming", errorCode: null },
      });
      if (count === 0) throw new StreamInProgressException();

      await this.touch(tx, message.conversation.projectId);
      return tx.message.findUniqueOrThrow({ where: { id: messageId } });
    });
  }

  /** Runs a transaction, mapping the one-streaming-row unique violation to a 409. */
  private async inTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isUniqueViolation(error)) throw new StreamInProgressException();
      throw error;
    }
  }

  private async activeConversation(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<{ id: string }> {
    const conversation = await tx.conversation.findFirst({
      where: { projectId, archivedAt: null },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  private async assertNoStreaming(
    tx: Prisma.TransactionClient,
    conversationId: string,
    exceptMessageId?: string,
  ): Promise<void> {
    const streaming = await tx.message.findFirst({
      where: {
        conversationId,
        status: "streaming",
        ...(exceptMessageId ? { id: { not: exceptMessageId } } : {}),
      },
      select: { id: true },
    });
    if (streaming) throw new StreamInProgressException();
  }

  private touch(tx: Prisma.TransactionClient, projectId: string) {
    return tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
  }

  private async insertMessages(
    projectId: string,
    content: string,
  ): Promise<{ userMessage: MessageRow; assistantMessage: MessageRow }> {
    return this.inTransaction(async (tx) => {
      await lockProject(tx, projectId);
      const conversation = await this.activeConversation(tx, projectId);
      await this.staleStreams.markStale(tx, {
        conversationId: conversation.id,
      });
      // Explicit, strictly increasing timestamps: `now()` is the transaction start,
      // so both rows would otherwise tie and could sort assistant-first.
      const userAt = new Date();
      const assistantAt = new Date(userAt.getTime() + 1);
      const userMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          kind: "chat",
          content,
          status: "complete",
          createdAt: userAt,
        },
      });
      const assistantMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          kind: "chat",
          content: "",
          status: "streaming",
          createdAt: assistantAt,
        },
      });
      await this.touch(tx, projectId);
      return { userMessage, assistantMessage };
    });
  }

  private loadHistory(assistantMessage: MessageRow): Promise<Message[]> {
    return this.prisma.message
      .findMany({
        where: {
          conversationId: assistantMessage.conversationId,
          createdAt: { lt: assistantMessage.createdAt },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
      .then((rows) => rows.map(toMessage));
  }

  /**
   * Watches for the client leaving. Called right after the ownership checks, before
   * any write, so an early disconnect cancels the provider call and the row is saved
   * `aborted`. `close` on the response fires when the socket goes away; if we have not
   * finished the response ourselves by then, the client left (Stop, tab closed, network).
   * (`request.raw.destroyed` is not used: Node destroys the request once its body is read.)
   */
  private watchClient(
    request: FastifyRequest,
    reply: FastifyReply,
  ): AbortSignal {
    const raw = reply.raw;
    const client = new AbortController();
    raw.on("error", () => undefined);
    raw.on("close", () => {
      if (!raw.writableFinished) client.abort();
    });
    if (raw.destroyed || request.raw.socket?.destroyed) client.abort();
    return client.signal;
  }

  /**
   * Takes over the raw response: SSE headers (plus any CORS headers already set
   * on the reply).
   */
  private openStream(reply: FastifyReply): SseWriter {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    raw.flushHeaders();

    return new SseWriter(raw, {
      validate:
        this.config.get("NODE_ENV", { infer: true }) !==
        NodeEnvironment.Production,
    });
  }
}
