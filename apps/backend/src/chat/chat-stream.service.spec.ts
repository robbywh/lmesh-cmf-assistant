import { EventEmitter } from "node:events";

import { SseEventSchema, type SseEvent } from "@lmesh/api-contract";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ScriptedAiProvider,
  type ScriptStep,
} from "../../test/support/scripted-ai.provider";
import {
  AiBadResponseException,
  AiProviderErrorException,
  AiUnavailableException,
  NotFoundException,
  StreamInProgressException,
} from "../common/exceptions";
import type { EnvironmentVariables } from "../config/env.validation";
import type { StaleStreamService } from "../conversations/stale-stream.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ChatStreamService } from "./chat-stream.service";
import { SseWriter, type SseSink } from "./sse-writer.util";

const CONFIG: Record<string, unknown> = {
  AI_FIRST_TOKEN_TIMEOUT_MS: 30_000,
  AI_REQUEST_TIMEOUT_MS: 120_000,
  AI_HISTORY_MAX_MESSAGES: 20,
  AI_HISTORY_MAX_CHARS: 24_000,
  NODE_ENV: "test",
};

const ids = {
  project: "5eed0001-0000-4000-8000-000000000001",
  conversation: "5eed0002-0000-4000-8000-000000000001",
  user: "5eed0003-0000-4000-8000-000000000001",
  assistant: "5eed0003-0000-4000-8000-000000000002",
};
const NOW = new Date("2026-01-01T00:00:00.000Z");

const row = (overrides: Record<string, unknown> = {}) => ({
  id: ids.assistant,
  conversationId: ids.conversation,
  role: "assistant",
  kind: "chat",
  content: "",
  status: "streaming",
  errorCode: null,
  createdAt: new Date(NOW.getTime() + 1),
  updatedAt: NOW,
  ...overrides,
});
const userRow = row({
  id: ids.user,
  role: "user",
  content: "Which leather?",
  status: "complete",
  createdAt: NOW,
});

class FakeRaw extends EventEmitter implements SseSink {
  public chunks: string[] = [];
  public writableEnded = false;
  public writableFinished = false;
  public destroyed = false;
  public writeHead = vi.fn();
  public flushHeaders = vi.fn();
  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  public end(): void {
    this.writableEnded = true;
    this.writableFinished = true;
  }
}

function parseEvents(chunks: string[]): SseEvent[] {
  return chunks
    .join("")
    .split("\n\n")
    .filter((frame) => frame.startsWith("event:"))
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      return SseEventSchema.parse(JSON.parse(data!.slice(6)));
    });
}

let saved: Record<string, unknown> = {};

function setup(
  script: ScriptStep[] = [],
  options: { configured?: boolean } = {},
) {
  saved = {};
  const provider = new ScriptedAiProvider(script, options.configured ?? true);
  // One shared set of table mocks: the service uses them both directly and inside transactions.
  const message = {
    create: vi.fn().mockResolvedValueOnce(userRow).mockResolvedValueOnce(row()),
    findMany: vi.fn().mockResolvedValue([userRow]),
    updateMany: vi.fn((args: { data: Record<string, unknown> }) => {
      saved = { ...saved, ...args.data };
      return Promise.resolve({ count: 1 });
    }),
    findUniqueOrThrow: vi.fn(() =>
      Promise.resolve(row({ ...saved, updatedAt: NOW })),
    ),
  };
  const project = {
    findFirst: vi
      .fn()
      .mockResolvedValue({ title: "SUV", description: "Warm earth" }),
    update: vi.fn().mockResolvedValue({}),
  };
  const tx = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue({ id: ids.conversation }),
    },
    message,
    project,
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    project,
    message,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const staleStreams = { markStale: vi.fn().mockResolvedValue(0) };
  const config = {
    get: (key: string) => CONFIG[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new ChatStreamService(
    prisma as unknown as PrismaService,
    staleStreams as unknown as StaleStreamService,
    config,
    provider,
  );
  const raw = new FakeRaw();
  const reply = {
    hijack: vi.fn(),
    raw,
    getHeaders: () => ({
      "access-control-allow-origin": "http://localhost:5173",
    }),
  } as unknown as FastifyReply;
  const request = { raw: new EventEmitter() } as unknown as FastifyRequest;
  const send = () =>
    service.start({
      user: { id: "u1" },
      projectId: ids.project,
      content: "Which leather?",
      request,
      reply,
    });
  return {
    service,
    provider,
    prisma,
    tx,
    staleStreams,
    raw,
    reply,
    request,
    send,
  };
}

const savedUpdate = (prisma: ReturnType<typeof setup>["prisma"]) =>
  prisma.message.updateMany.mock.calls[0]![0].data;

describe("ChatStreamService (send message)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("streams message.created, then token events, then done, and saves the message complete", async () => {
    const { send, raw, prisma, reply } = setup([
      { delta: "Hel" },
      { delta: "lo" },
    ]);

    await send();

    const events = parseEvents(raw.chunks);
    expect(events.map((e) => e.type)).toEqual([
      "message.created",
      "token",
      "token",
      "done",
    ]);
    expect(events[0]).toMatchObject({
      userMessage: { content: "Which leather?", status: "complete" },
      assistantMessage: { status: "streaming", content: "" },
    });
    expect(events[3]).toMatchObject({
      message: { content: "Hello", status: "complete" },
    });
    expect(savedUpdate(prisma)).toEqual({
      content: "Hello",
      status: "complete",
      errorCode: null,
    });
    expect(raw.writableEnded).toBe(true);
    expect(reply.hijack).toHaveBeenCalledTimes(1);
  });

  it("writes SSE headers, including the CORS headers already set on the reply", async () => {
    const { send, raw } = setup([{ delta: "x" }]);

    await send();

    const headers = raw.writeHead.mock.calls[0]![1] as Record<string, string>;
    expect(headers).toMatchObject({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "access-control-allow-origin": "http://localhost:5173",
    });
  });

  it("sends the system prompt, history and the new user message to the provider", async () => {
    const { send, provider } = setup([{ delta: "x" }]);

    await send();

    expect(provider.lastMessages[0]?.role).toBe("system");
    expect(provider.lastMessages[0]?.content).toContain("Title: SUV");
    expect(provider.lastMessages.at(-1)).toEqual({
      role: "user",
      content: "Which leather?",
    });
  });

  it("saves the partial content as error with the mapped code and ends with an error event when the provider fails after tokens", async () => {
    const { send, raw, prisma } = setup([
      { delta: "Part" },
      { delta: "ial" },
      { error: new AiProviderErrorException("raw provider secret", 500) },
    ]);

    await send();

    const events = parseEvents(raw.chunks);
    expect(events.map((e) => e.type)).toEqual([
      "message.created",
      "token",
      "token",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({
      code: "AI_PROVIDER_ERROR",
      message: "The AI provider returned an error. Please try again.",
    });
    expect(raw.chunks.join("")).not.toContain("raw provider secret");
    expect(savedUpdate(prisma)).toEqual({
      content: "Partial",
      status: "error",
      errorCode: "AI_PROVIDER_ERROR",
    });
  });

  it("maps a malformed provider response to AI_BAD_RESPONSE", async () => {
    const { send, prisma, raw } = setup([
      { error: new AiBadResponseException() },
    ]);

    await send();

    expect(savedUpdate(prisma)).toMatchObject({
      status: "error",
      errorCode: "AI_BAD_RESPONSE",
    });
    expect(parseEvents(raw.chunks).at(-1)).toMatchObject({
      code: "AI_BAD_RESPONSE",
    });
  });

  it("fails with AI_TIMEOUT when no first token arrives within AI_FIRST_TOKEN_TIMEOUT_MS", async () => {
    const { send, prisma, raw, provider } = setup([{ hang: true }]);

    const running = send();
    await vi.advanceTimersByTimeAsync(30_000);
    await running;

    expect(savedUpdate(prisma)).toEqual({
      content: "",
      status: "error",
      errorCode: "AI_TIMEOUT",
    });
    expect(parseEvents(raw.chunks).at(-1)).toMatchObject({
      code: "AI_TIMEOUT",
      message: "The assistant took too long to respond.",
    });
    expect(provider.lastSignal?.aborted).toBe(true);
  });

  it("keeps the partial content and fails with AI_TIMEOUT when the total AI_REQUEST_TIMEOUT_MS is exceeded", async () => {
    const { send, prisma } = setup([{ delta: "partial " }, { hang: true }]);

    const running = send();
    await vi.advanceTimersByTimeAsync(120_000);
    await running;

    expect(savedUpdate(prisma)).toEqual({
      content: "partial ",
      status: "error",
      errorCode: "AI_TIMEOUT",
    });
  });

  it("is not subject to the first-token timeout once a token has arrived", async () => {
    const { send, prisma } = setup([
      { delta: "first" },
      { delayMs: 40_000 },
      { delta: " second" },
    ]);

    const running = send();
    await vi.advanceTimersByTimeAsync(40_000);
    await running;

    expect(savedUpdate(prisma)).toMatchObject({
      content: "first second",
      status: "complete",
    });
  });

  it("sends a ': ping' heartbeat every 15 seconds while waiting", async () => {
    const { send, raw } = setup([{ delayMs: 31_000 }, { delta: "late" }]);
    CONFIG.AI_FIRST_TOKEN_TIMEOUT_MS = 60_000;
    try {
      const running = send();
      await vi.advanceTimersByTimeAsync(31_000);
      await running;
    } finally {
      CONFIG.AI_FIRST_TOKEN_TIMEOUT_MS = 30_000;
    }

    expect(raw.chunks.filter((chunk) => chunk === ": ping\n\n")).toHaveLength(
      2,
    );
  });

  it("times out a provider that ignores the abort signal (the race, not the provider, ends the stream)", async () => {
    const { send, prisma, raw } = setup([{ delayMs: 600_000 }]);

    const running = send();
    await vi.advanceTimersByTimeAsync(30_000);
    await running;

    expect(savedUpdate(prisma)).toEqual({
      content: "",
      status: "error",
      errorCode: "AI_TIMEOUT",
    });
    expect(parseEvents(raw.chunks).at(-1)).toMatchObject({
      type: "error",
      code: "AI_TIMEOUT",
    });
    expect(raw.writableEnded).toBe(true);
  });

  it("saves aborted with no final event when the client disconnects from a provider that ignores the abort signal", async () => {
    const { send, prisma, raw } = setup([
      { delta: "Half" },
      { delayMs: 600_000 },
    ]);

    const running = send();
    await vi.advanceTimersByTimeAsync(0);
    raw.emit("close");
    await running;

    expect(savedUpdate(prisma)).toEqual({
      content: "Half",
      status: "aborted",
      errorCode: null,
    });
    expect(parseEvents(raw.chunks).map((e) => e.type)).toEqual([
      "message.created",
      "token",
    ]);
  });

  it("saves aborted, sends no final event and aborts the provider signal when the client disconnects", async () => {
    const { send, raw, prisma, provider } = setup([
      { delta: "Half" },
      { hang: true },
    ]);

    const running = send();
    await vi.advanceTimersByTimeAsync(0);
    raw.emit("close"); // socket closed before we ended the response
    await running;

    expect(savedUpdate(prisma)).toEqual({
      content: "Half",
      status: "aborted",
      errorCode: null,
    });
    expect(provider.lastSignal?.aborted).toBe(true);
    expect(parseEvents(raw.chunks).map((e) => e.type)).toEqual([
      "message.created",
      "token",
    ]);
  });

  it("logs and saves INTERNAL_ERROR for an unexpected error, with a safe error event", async () => {
    const { send, prisma, raw } = setup([
      { error: new Error("db password leaked") },
    ]);

    await send();

    expect(savedUpdate(prisma)).toMatchObject({
      status: "error",
      errorCode: "INTERNAL_ERROR",
    });
    expect(raw.chunks.join("")).not.toContain("db password leaked");
    expect(parseEvents(raw.chunks).at(-1)).toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("only finishes a row that is still streaming, and never sends a misleading done when it lost the race", async () => {
    const { send, prisma, raw } = setup([{ delta: "late answer" }]);
    prisma.message.updateMany.mockResolvedValue({ count: 0 });
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    await send();

    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ids.assistant, status: "streaming" },
      }),
    );
    const events = parseEvents(raw.chunks);
    expect(events.map((e) => e.type)).toEqual([
      "message.created",
      "token",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(prisma.message.findUniqueOrThrow).not.toHaveBeenCalled();
    // only the insert transaction touched the project; the discarded result did not
    expect(prisma.project.update).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no longer streaming"),
    );
    expect(raw.writableEnded).toBe(true);
    warn.mockRestore();
  });

  it("sends nothing and just closes when the lost-race run's client is already gone", async () => {
    const { send, prisma, raw } = setup([{ delta: "x" }, { hang: true }]);
    prisma.message.updateMany.mockResolvedValue({ count: 0 });

    const running = send();
    await vi.advanceTimersByTimeAsync(0);
    raw.destroyed = true; // a dropped connection destroys the socket
    raw.emit("close");
    await running;

    expect(parseEvents(raw.chunks).map((e) => e.type)).toEqual([
      "message.created",
      "token",
    ]);
  });

  it("saves the outcome and touches the project in one transaction", async () => {
    const { send, prisma } = setup([{ delta: "x" }]);

    await send();

    // the transaction for the inserts plus the one for the final save
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const saveOrder = prisma.message.updateMany.mock.invocationCallOrder[0]!;
    const touchOrder = prisma.project.update.mock.invocationCallOrder.at(-1)!;
    expect(saveOrder).toBeLessThan(touchOrder);
  });

  it("retries once with a minimal error write when the final save fails, and tells the client", async () => {
    const { send, prisma, raw, tx } = setup([{ delta: "x" }]);
    let calls = 0;
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => {
        calls += 1;
        // 1st: inserts (works). 2nd: the final save (fails).
        return calls === 2 ? Promise.reject(new Error("db down")) : fn(tx);
      },
    );

    await send();

    expect(prisma.message.updateMany).toHaveBeenLastCalledWith({
      where: { id: ids.assistant, status: "streaming" },
      data: { status: "error", errorCode: "INTERNAL_ERROR" },
    });
    expect(parseEvents(raw.chunks).at(-1)).toMatchObject({
      type: "error",
      code: "INTERNAL_ERROR",
    });
    expect(raw.writableEnded).toBe(true);
  });

  it("touches the project's updatedAt when the stream ends", async () => {
    const { send, prisma } = setup([{ delta: "x" }]);

    await send();

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: ids.project },
      data: { updatedAt: expect.any(Date) as Date },
    });
  });
});

describe("ChatStreamService pre-stream checks (JSON errors, nothing hijacked)", () => {
  it("throws StreamInProgressException when the unique index rejects a second streaming row", async () => {
    const { send, prisma, reply, provider } = setup([{ delta: "x" }]);
    prisma.$transaction.mockRejectedValue(
      new Error("Unique constraint failed"),
    );

    await expect(send()).rejects.toBeInstanceOf(StreamInProgressException);
    expect(reply.hijack).not.toHaveBeenCalled();
    expect(provider.calls).toBe(0);
  });

  it("throws AiUnavailableException when the provider is not configured, before inserting anything", async () => {
    const { send, prisma, reply } = setup([], { configured: false });

    await expect(send()).rejects.toBeInstanceOf(AiUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reply.hijack).not.toHaveBeenCalled();
  });

  it("throws NotFoundException for a missing or foreign project, before inserting anything", async () => {
    const { send, prisma, reply } = setup();
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(send()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reply.hijack).not.toHaveBeenCalled();
  });

  it("saves the placeholder as error/INTERNAL_ERROR (conditional on still streaming) and rethrows when building the prompt fails before the stream opens", async () => {
    const { send, prisma, reply, provider } = setup([{ delta: "x" }]);
    prisma.message.findMany.mockRejectedValue(
      new Error("history query failed"),
    );

    await expect(send()).rejects.toThrow("history query failed");

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: ids.assistant, status: "streaming" },
      data: { status: "error", errorCode: "INTERNAL_ERROR" },
    });
    expect(provider.calls).toBe(0);
    expect(reply.hijack).not.toHaveBeenCalled();
  });

  it("skips the provider and saves aborted when the socket is already destroyed before the stream opens", async () => {
    const { send, prisma, provider, raw } = setup([{ delta: "never" }]);
    raw.destroyed = true;

    await send();

    expect(provider.calls).toBe(0);
    expect(savedUpdate(prisma)).toEqual({
      content: "",
      status: "aborted",
      errorCode: null,
    });
    expect(raw.chunks).toEqual([]);
  });

  it("detects a destroyed request socket as well", async () => {
    const { send, prisma, provider, request } = setup([{ delta: "never" }]);
    (request.raw as unknown as { socket: { destroyed: boolean } }).socket = {
      destroyed: true,
    };

    await send();

    expect(provider.calls).toBe(0);
    expect(savedUpdate(prisma)).toMatchObject({ status: "aborted" });
  });

  it("flips stale streaming rows, then inserts the user message and a later-timestamped placeholder in one transaction", async () => {
    const { send, tx, staleStreams } = setup([{ delta: "x" }]);

    await send();

    expect(staleStreams.markStale).toHaveBeenCalledWith(tx, {
      conversationId: ids.conversation,
    });
    expect(tx.message.create).toHaveBeenCalledTimes(2);
    const [userCall, assistantCall] = (
      tx.message.create.mock.calls as unknown as [
        { data: { createdAt: Date; status: string } },
      ][]
    ).map((call) => call[0].data);
    expect(userCall!.status).toBe("complete");
    expect(assistantCall!.status).toBe("streaming");
    expect(assistantCall!.createdAt.getTime()).toBeGreaterThan(
      userCall!.createdAt.getTime(),
    );
  });
});

describe("SseWriter used by the stream", () => {
  it("validates events against the contract in test mode", () => {
    const raw = new FakeRaw();
    const writer = new SseWriter(raw, { validate: true });

    expect(() =>
      writer.event({ type: "token", messageId: "not-a-uuid", delta: "x" }),
    ).toThrow();
  });
});
