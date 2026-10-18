import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureCredentialUser } from "../prisma/seed-user";
import { AI_PROVIDER } from "../src/ai/ai.constants";
import { AiProviderErrorException } from "../src/common/exceptions";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, signInCookie } from "./support/create-test-app";
import { ScriptedAiProvider } from "./support/scripted-ai.provider";
import { parseSseBody } from "./support/sse";

// Dedicated users: specs run in parallel on one database, so none may clean up another's data.
const MAIN_USER = {
  email: "chat-main@lmesh.test",
  name: "Chat Main",
  password: "main-password-1",
};
const OTHER_USER = {
  email: "chat-other@lmesh.test",
  name: "Chat Other",
  password: "other-password-1",
};

describe("POST /projects/:projectId/messages (e2e, real Postgres, scripted AI)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let cookie: string;
  let otherCookie: string;
  const provider = new ScriptedAiProvider();

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp(
      [],
      [{ token: AI_PROVIDER, value: provider }],
    ));
    await ensureCredentialUser(prisma, MAIN_USER);
    await ensureCredentialUser(prisma, OTHER_USER);
    cookie = await signInCookie(app, MAIN_USER.email, MAIN_USER.password);
    otherCookie = await signInCookie(
      app,
      OTHER_USER.email,
      OTHER_USER.password,
    );
  }, 60_000);

  afterAll(async () => {
    await prisma.project.deleteMany({
      where: { owner: { email: { in: [MAIN_USER.email, OTHER_USER.email] } } },
    });
    await close();
  });

  beforeEach(() => {
    provider.script = [{ delta: "Hello " }, { delta: "designer" }];
    provider.setConfigured(true);
  });

  async function newProject(as = cookie) {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: as },
      payload: { title: "Chat project", description: "Warm tones" },
    });
    const projectId = created.json<{ data: { id: string } }>().data.id;
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { projectId, archivedAt: null },
    });
    return { projectId, conversationId: conversation.id };
  }

  const send = (
    projectId: string,
    content: unknown,
    as: string | null = cookie,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/messages`,
      headers: as ? { cookie: as } : {},
      payload: { content },
    });

  const rows = (conversationId: string) =>
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

  it("streams message.created, tokens and done as valid SSE and saves both messages", async () => {
    const { projectId, conversationId } = await newProject();

    const response = await send(projectId, "  Which leather?  ");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    const events = parseSseBody(response.body);
    expect(events.map((e) => e.type)).toEqual([
      "message.created",
      "token",
      "token",
      "done",
    ]);
    const done = events.at(-1);
    expect(done).toMatchObject({
      message: {
        content: "Hello designer",
        status: "complete",
        role: "assistant",
      },
    });
    const saved = await rows(conversationId);
    expect(saved.map((m) => [m.role, m.status, m.content])).toEqual([
      ["user", "complete", "Which leather?"],
      ["assistant", "complete", "Hello designer"],
    ]);
    expect(provider.lastMessages[0]?.role).toBe("system");
    expect(provider.lastMessages.at(-1)).toEqual({
      role: "user",
      content: "Which leather?",
    });
  });

  it("moves the project to the top of the list (updatedAt)", async () => {
    const first = await newProject();
    await newProject();

    await send(first.projectId, "bump");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { cookie },
    });
    expect(list.json<{ data: { id: string }[] }>().data[0]?.id).toBe(
      first.projectId,
    );
  });

  it("returns 401 JSON without a session and writes nothing", async () => {
    const { projectId, conversationId } = await newProject();

    const response = await send(projectId, "hi", null);

    expect(response.statusCode).toBe(401);
    expect(response.json<{ code: string }>().code).toBe("UNAUTHORIZED");
    expect(await rows(conversationId)).toHaveLength(0);
  });

  it("returns 404 JSON for a foreign project and writes nothing", async () => {
    const { projectId, conversationId } = await newProject();

    const response = await send(projectId, "hi", otherCookie);

    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe("NOT_FOUND");
    expect(await rows(conversationId)).toHaveLength(0);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["4001 characters", "x".repeat(4001)],
  ])(
    "returns 400 VALIDATION_FAILED for a %s message and writes nothing",
    async (_n, content) => {
      const { projectId, conversationId } = await newProject();

      const response = await send(projectId, content);

      expect(response.statusCode).toBe(400);
      const body = response.json<{
        code: string;
        errors: Record<string, string[]>;
      }>();
      expect(body.code).toBe("VALIDATION_FAILED");
      expect(body.errors.content?.length).toBeGreaterThan(0);
      expect(await rows(conversationId)).toHaveLength(0);
    },
  );

  it("accepts a 4000 character message", async () => {
    const { projectId } = await newProject();

    const response = await send(projectId, "x".repeat(4000));

    expect(response.statusCode).toBe(200);
  });

  it("returns 503 AI_UNAVAILABLE JSON when the provider is not configured and writes nothing", async () => {
    provider.setConfigured(false);
    const { projectId, conversationId } = await newProject();

    const response = await send(projectId, "hi");

    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe("AI_UNAVAILABLE");
    expect(await rows(conversationId)).toHaveLength(0);
  });

  it("returns 409 STREAM_IN_PROGRESS while a fresh streaming row exists, writing nothing", async () => {
    const { projectId, conversationId } = await newProject();
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        status: "streaming",
        content: "",
      },
    });

    const response = await send(projectId, "second");

    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
    expect(await rows(conversationId)).toHaveLength(1);
  });

  it("lets only one of two concurrent sends start the stream (the other gets 409)", async () => {
    provider.script = [{ delayMs: 200 }, { delta: "slow" }];
    const { projectId, conversationId } = await newProject();

    const [a, b] = await Promise.all([
      send(projectId, "one"),
      send(projectId, "two"),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const messages = await rows(conversationId);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("saves the partial content as error and ends with an error event when the provider fails mid-stream", async () => {
    provider.script = [
      { delta: "Partial " },
      { error: new AiProviderErrorException("secret provider body", 500) },
    ];
    const { projectId, conversationId } = await newProject();

    const response = await send(projectId, "hi");

    expect(response.statusCode).toBe(200);
    const events = parseSseBody(response.body);
    expect(events.map((e) => e.type)).toEqual([
      "message.created",
      "token",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({ code: "AI_PROVIDER_ERROR" });
    expect(response.body).not.toContain("secret provider body");
    const assistant = (await rows(conversationId)).find(
      (m) => m.role === "assistant",
    );
    expect(assistant).toMatchObject({
      status: "error",
      errorCode: "AI_PROVIDER_ERROR",
      content: "Partial ",
    });
  });

  it("does not let a stale streaming row block a new message (it is flipped to error first)", async () => {
    const { projectId, conversationId } = await newProject();
    const stale = await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        status: "streaming",
        content: "old",
      },
    });
    await prisma.$executeRaw`UPDATE messages SET updated_at = now() - interval '10 minutes' WHERE id = ${stale.id}::uuid`;

    const response = await send(projectId, "fresh start");

    expect(response.statusCode).toBe(200);
    const flipped = await prisma.message.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(flipped).toMatchObject({ status: "error", errorCode: "AI_TIMEOUT" });
  });

  it("includes earlier complete messages but not failed ones in the prompt", async () => {
    const { projectId, conversationId } = await newProject();
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        status: "complete",
        content: "earlier question",
        createdAt: new Date(Date.now() - 5000),
      },
    });
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        status: "error",
        errorCode: "AI_TIMEOUT",
        content: "broken",
        createdAt: new Date(Date.now() - 4000),
      },
    });

    await send(projectId, "next question");

    const sent = provider.lastMessages.map((m) => m.content);
    expect(sent).toContain("earlier question");
    expect(sent).not.toContain("broken");
    expect(sent.at(-1)).toBe("next question");
  });

  it("never sends archived messages to the model: send, reset, send again gives only [system, user]", async () => {
    const { projectId } = await newProject();
    await send(projectId, "first question");
    const reset = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/conversations`,
      headers: { cookie },
    });
    expect(reset.statusCode).toBe(201);

    await send(projectId, "second question");

    expect(provider.lastMessages.map((m) => m.role)).toEqual([
      "system",
      "user",
    ]);
    expect(provider.lastMessages.at(-1)?.content).toBe("second question");
  });

  it("uses an edited description in the next prompt (FR-PROJ-04)", async () => {
    const { projectId } = await newProject();
    await send(projectId, "before the edit");
    expect(provider.lastMessages[0]?.content).toContain(
      "Description: Warm tones",
    );

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: { cookie },
      payload: { description: "Now cool grey, recycled textiles" },
    });
    expect(patch.statusCode).toBe(200);
    await send(projectId, "after the edit");

    const system = provider.lastMessages[0]?.content ?? "";
    expect(system).toContain("Description: Now cool grey, recycled textiles");
    expect(system).not.toContain("Warm tones");
  });

  it("serialises a send and a reset per project: no message ever lands in an archived conversation (5 rounds)", async () => {
    for (let round = 0; round < 5; round++) {
      provider.script = [{ delayMs: 150 }, { delta: "slow answer" }];
      const { projectId } = await newProject();

      const [sent, reset] = await Promise.all([
        send(projectId, `racing send ${round}`),
        app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/conversations`,
          headers: { cookie },
        }),
      ]);

      // Either the send won the lock (reset sees a stream: 409) or the reset did (send lands in the new conversation).
      expect(sent.statusCode).toBe(200);
      expect([201, 409]).toContain(reset.statusCode);
      const conversations = await prisma.conversation.findMany({
        where: { projectId },
        include: {
          messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      });
      const active = conversations.filter((c) => c.archivedAt === null);
      const archived = conversations.filter((c) => c.archivedAt !== null);
      expect(active).toHaveLength(1);
      expect(archived.flatMap((c) => c.messages)).toEqual([]);
      expect(active[0]?.messages.map((m) => m.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(active[0]?.messages.every((m) => m.status === "complete")).toBe(
        true,
      );
    }
  });

  it("documents the endpoint as text/event-stream in OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });

    const paths = response.json<{
      paths: Record<
        string,
        { post?: { responses: Record<string, { content?: object }> } }
      >;
    }>().paths;
    const operation = paths["/api/v1/projects/{projectId}/messages"]?.post;
    expect(Object.keys(operation?.responses["200"]?.content ?? {})).toContain(
      "text/event-stream",
    );
  });
});
