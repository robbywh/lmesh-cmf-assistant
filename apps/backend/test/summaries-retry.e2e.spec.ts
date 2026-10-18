import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureCredentialUser } from "../prisma/seed-user";
import { AI_PROVIDER } from "../src/ai/ai.constants";
import { SUMMARY_INSTRUCTION } from "../src/chat/prompts.util";
import { AiProviderErrorException } from "../src/common/exceptions";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, signInCookie } from "./support/create-test-app";
import { ScriptedAiProvider } from "./support/scripted-ai.provider";
import { parseSseBody } from "./support/sse";

// Dedicated users: specs run in parallel on one database, so none may clean up another's data.
const MAIN_USER = {
  email: "summ-main@lmesh.test",
  name: "Summ Main",
  password: "main-password-1",
};
const OTHER_USER = {
  email: "summ-other@lmesh.test",
  name: "Summ Other",
  password: "other-password-1",
};

describe("summaries and retry (e2e, real Postgres, scripted AI)", () => {
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
    provider.script = [{ delta: "Answer" }];
    provider.setConfigured(true);
  });

  async function newProject(as = cookie) {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: as },
      payload: { title: "Summ project", description: "Warm tones" },
    });
    const projectId = created.json<{ data: { id: string } }>().data.id;
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { projectId, archivedAt: null },
    });
    return { projectId, conversationId: conversation.id };
  }

  let clock = Date.now() - 600_000;
  const add = (
    conversationId: string,
    data: {
      role: "user" | "assistant";
      status?: "complete" | "error" | "aborted" | "streaming";
      kind?: "chat" | "summary";
      content: string;
      errorCode?: string;
    },
  ) =>
    prisma.message.create({
      data: {
        conversationId,
        role: data.role,
        status: data.status ?? "complete",
        kind: data.kind ?? "chat",
        content: data.content,
        errorCode: data.errorCode ?? null,
        createdAt: new Date((clock += 1000)),
      },
    });

  const post = (url: string, as: string | null = cookie) =>
    app.inject({
      method: "POST",
      url: `/api/v1${url}`,
      headers: as ? { cookie: as } : {},
    });
  const summarise = (projectId: string, as: string | null = cookie) =>
    post(`/projects/${projectId}/summaries`, as);
  const retry = (messageId: string, as: string | null = cookie) =>
    post(`/messages/${messageId}/retry`, as);

  const rows = (conversationId: string) =>
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

  describe("POST /projects/:projectId/summaries", () => {
    it("streams a kind=summary message, ends the prompt with the summary instruction and creates no user message", async () => {
      const { projectId, conversationId } = await newProject();
      await add(conversationId, { role: "user", content: "Which leather?" });
      await add(conversationId, {
        role: "assistant",
        content: "Sand leather.",
      });
      provider.script = [
        { delta: "## Design direction\n" },
        { delta: "Warm." },
      ];

      const response = await summarise(projectId);

      expect(response.statusCode).toBe(200);
      const events = parseSseBody(response.body);
      expect(events.map((e) => e.type)).toEqual([
        "message.created",
        "token",
        "token",
        "done",
      ]);
      expect(events[0]).toMatchObject({
        userMessage: null,
        assistantMessage: {
          kind: "summary",
          role: "assistant",
          status: "streaming",
        },
      });
      expect(events.at(-1)).toMatchObject({
        message: {
          kind: "summary",
          status: "complete",
          content: "## Design direction\nWarm.",
        },
      });
      expect(provider.lastMessages.at(-1)).toEqual({
        role: "user",
        content: SUMMARY_INSTRUCTION,
      });
      const saved = await rows(conversationId);
      expect(saved.map((m) => [m.role, m.kind])).toEqual([
        ["user", "chat"],
        ["assistant", "chat"],
        ["assistant", "summary"],
      ]);
    });

    it("returns 409 NOTHING_TO_SUMMARISE when there is no complete assistant reply, writing nothing", async () => {
      const { projectId, conversationId } = await newProject();
      await add(conversationId, { role: "user", content: "Anyone there?" });
      await add(conversationId, {
        role: "assistant",
        status: "error",
        errorCode: "AI_TIMEOUT",
        content: "",
      });

      const response = await summarise(projectId);

      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe(
        "NOTHING_TO_SUMMARISE",
      );
      expect(await rows(conversationId)).toHaveLength(2);
    });

    it("returns 409 STREAM_IN_PROGRESS while a reply is streaming", async () => {
      const { projectId, conversationId } = await newProject();
      await add(conversationId, {
        role: "assistant",
        content: "Done earlier.",
      });
      await add(conversationId, {
        role: "assistant",
        status: "streaming",
        content: "",
      });

      const response = await summarise(projectId);

      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
    });

    it("returns 404 for a foreign project, 401 without a session and 503 when the provider is not configured", async () => {
      const { projectId, conversationId } = await newProject();
      await add(conversationId, { role: "assistant", content: "Reply." });

      const foreign = await summarise(projectId, otherCookie);
      const anonymous = await summarise(projectId, null);
      provider.setConfigured(false);
      const unconfigured = await summarise(projectId);

      expect(foreign.statusCode).toBe(404);
      expect(anonymous.statusCode).toBe(401);
      expect(unconfigured.statusCode).toBe(503);
      expect(unconfigured.json<{ code: string }>().code).toBe("AI_UNAVAILABLE");
      expect(await rows(conversationId)).toHaveLength(1);
    });

    it("saves a failed summary as error and lets it be retried, staying kind=summary with the instruction re-applied", async () => {
      const { projectId, conversationId } = await newProject();
      await add(conversationId, { role: "user", content: "Q" });
      await add(conversationId, { role: "assistant", content: "A" });
      provider.script = [{ error: new AiProviderErrorException("boom", 500) }];
      const failed = await summarise(projectId);
      const failedEvent = parseSseBody(failed.body).at(-1);
      expect(failedEvent).toMatchObject({
        type: "error",
        code: "AI_PROVIDER_ERROR",
      });
      const summaryId = (failedEvent as { messageId: string }).messageId;

      provider.script = [{ delta: "## Design direction\nOK" }];
      const retried = await retry(summaryId);

      expect(retried.statusCode).toBe(200);
      const events = parseSseBody(retried.body);
      expect(events[0]).toMatchObject({
        userMessage: null,
        assistantMessage: {
          id: summaryId,
          kind: "summary",
          status: "streaming",
          content: "",
        },
      });
      expect(events.at(-1)).toMatchObject({
        message: { id: summaryId, kind: "summary", status: "complete" },
      });
      expect(provider.lastMessages.at(-1)).toEqual({
        role: "user",
        content: SUMMARY_INSTRUCTION,
      });
      const saved = await prisma.message.findUniqueOrThrow({
        where: { id: summaryId },
      });
      expect(saved).toMatchObject({
        kind: "summary",
        status: "complete",
        errorCode: null,
      });
    });
  });

  describe("POST /messages/:messageId/retry", () => {
    async function failedReply(status: "error" | "aborted") {
      const project = await newProject();
      await add(project.conversationId, {
        role: "user",
        content: "earlier question",
      });
      await add(project.conversationId, {
        role: "assistant",
        content: "earlier answer",
      });
      await add(project.conversationId, {
        role: "user",
        content: "the question",
      });
      const failed = await add(project.conversationId, {
        role: "assistant",
        status,
        errorCode: status === "error" ? "AI_TIMEOUT" : undefined,
        content: "partial text",
      });
      return { ...project, failedId: failed.id };
    }

    it("reuses the failed message id, ends complete and sends the same history (failed reply excluded)", async () => {
      const { conversationId, failedId } = await failedReply("error");
      provider.script = [{ delta: "Better " }, { delta: "answer" }];

      const response = await retry(failedId);

      expect(response.statusCode).toBe(200);
      const events = parseSseBody(response.body);
      expect(events[0]).toMatchObject({
        type: "message.created",
        userMessage: null,
        assistantMessage: {
          id: failedId,
          status: "streaming",
          content: "",
          errorCode: null,
        },
      });
      expect(events.at(-1)).toMatchObject({
        type: "done",
        message: { id: failedId, status: "complete", content: "Better answer" },
      });
      const sent = provider.lastMessages.map((m) => m.content);
      expect(sent.slice(1)).toEqual([
        "earlier question",
        "earlier answer",
        "the question",
      ]);
      expect(sent).not.toContain("partial text");
      expect(await rows(conversationId)).toHaveLength(4);
    });

    it("lets only one of two concurrent retries of the same message start (the other gets 409), with one provider call", async () => {
      const { failedId } = await failedReply("error");
      provider.script = [
        { delayMs: 200 },
        { delta: "Only " },
        { delta: "once" },
      ];
      const callsBefore = provider.calls;

      const [a, b] = await Promise.all([retry(failedId), retry(failedId)]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
      const loser = a.statusCode === 409 ? a : b;
      expect(loser.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
      expect(provider.calls - callsBefore).toBe(1);
      expect(
        await prisma.message.findUniqueOrThrow({ where: { id: failedId } }),
      ).toMatchObject({
        status: "complete",
        content: "Only once",
      });
    });

    it("retries an aborted message too", async () => {
      const { failedId } = await failedReply("aborted");

      const response = await retry(failedId);

      expect(response.statusCode).toBe(200);
      expect(parseSseBody(response.body).at(-1)).toMatchObject({
        type: "done",
      });
    });

    it("saves a second failure on the same message and keeps it retryable", async () => {
      const { failedId } = await failedReply("error");
      provider.script = [{ error: new AiProviderErrorException("again", 502) }];

      const response = await retry(failedId);

      expect(parseSseBody(response.body).at(-1)).toMatchObject({
        type: "error",
        messageId: failedId,
        code: "AI_PROVIDER_ERROR",
      });
      const saved = await prisma.message.findUniqueOrThrow({
        where: { id: failedId },
      });
      expect(saved).toMatchObject({
        status: "error",
        errorCode: "AI_PROVIDER_ERROR",
      });
    });

    it("returns 409 MESSAGE_NOT_RETRYABLE for a complete message, a user message and a non-last failed reply", async () => {
      const { conversationId, failedId } = await failedReply("error");
      const complete = (await rows(conversationId)).find(
        (m) => m.role === "assistant" && m.status === "complete",
      )!;
      const userMessage = (await rows(conversationId)).find(
        (m) => m.role === "user",
      )!;
      await add(conversationId, { role: "user", content: "a later question" });

      const responses = await Promise.all([
        retry(complete.id),
        retry(userMessage.id),
        retry(failedId),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(409);
        expect(response.json<{ code: string }>().code).toBe(
          "MESSAGE_NOT_RETRYABLE",
        );
      }
      expect(
        await prisma.message.findUniqueOrThrow({ where: { id: failedId } }),
      ).toMatchObject({
        status: "error",
        content: "partial text",
      });
    });

    it("returns 409 MESSAGE_NOT_RETRYABLE for a message in an archived conversation", async () => {
      const { projectId, failedId } = await failedReply("error");
      const reset = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/conversations`,
        headers: { cookie },
      });
      expect(reset.statusCode).toBe(201);

      const response = await retry(failedId);

      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe(
        "MESSAGE_NOT_RETRYABLE",
      );
    });

    it("returns 409 STREAM_IN_PROGRESS when another reply is streaming", async () => {
      const { conversationId, failedId } = await failedReply("error");
      await add(conversationId, {
        role: "assistant",
        status: "streaming",
        content: "",
      });

      const response = await retry(failedId);

      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
    });

    it("returns 404 for a foreign or unknown message, 401 without a session, 400 for a bad id and 503 when unconfigured", async () => {
      const { failedId } = await failedReply("error");

      const foreign = await retry(failedId, otherCookie);
      const unknown = await retry("00000000-0000-4000-8000-000000000000");
      const anonymous = await retry(failedId, null);
      const badId = await retry("not-a-uuid");
      provider.setConfigured(false);
      const unconfigured = await retry(failedId);

      expect(foreign.statusCode).toBe(404);
      expect(unknown.statusCode).toBe(404);
      expect(anonymous.statusCode).toBe(401);
      expect(badId.statusCode).toBe(400);
      expect(unconfigured.statusCode).toBe(503);
      expect(
        await prisma.message.findUniqueOrThrow({ where: { id: failedId } }),
      ).toMatchObject({
        status: "error",
      });
    });

    it("treats a stale streaming reply as a retryable error", async () => {
      const { conversationId } = await newProject();
      await add(conversationId, { role: "user", content: "q" });
      const stale = await add(conversationId, {
        role: "assistant",
        status: "streaming",
        content: "crashed",
      });
      await prisma.$executeRaw`UPDATE messages SET updated_at = now() - interval '10 minutes' WHERE id = ${stale.id}::uuid`;

      const response = await retry(stale.id);

      expect(response.statusCode).toBe(200);
      expect(parseSseBody(response.body).at(-1)).toMatchObject({
        type: "done",
        message: { id: stale.id },
      });
    });

    it("documents both endpoints as text/event-stream in OpenAPI", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/docs-json",
      });

      const paths = response.json<{
        paths: Record<
          string,
          { post?: { responses: Record<string, { content?: object }> } }
        >;
      }>().paths;
      for (const path of [
        "/api/v1/projects/{projectId}/summaries",
        "/api/v1/messages/{messageId}/retry",
      ]) {
        expect(
          Object.keys(paths[path]?.post?.responses["200"]?.content ?? {}),
        ).toContain("text/event-stream");
      }
    });
  });
});
