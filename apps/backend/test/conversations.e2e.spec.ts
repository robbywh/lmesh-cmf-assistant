import {
  ActiveConversationSchema,
  type ActiveConversation,
} from "@lmesh/api-contract";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureCredentialUser } from "../prisma/seed-user";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, signInCookie } from "./support/create-test-app";

// Dedicated users: specs run in parallel on one database, so none may clean up another's data.
const MAIN_USER = {
  email: "conv-main@lmesh.test",
  name: "Conv Main",
  password: "main-password-1",
};
const OTHER_USER = {
  email: "conv-other@lmesh.test",
  name: "Conv Other",
  password: "other-password-1",
};
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("conversations (e2e, real Postgres)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let cookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp());
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

  const call = (
    method: "GET" | "POST" | "DELETE",
    url: string,
    as?: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: as ? { cookie: as } : {},
      ...(payload ? { payload } : {}),
    });

  async function newProject(as = cookie): Promise<{
    projectId: string;
    conversationId: string;
  }> {
    const created = await call("POST", "/projects", as, { title: "Conv" });
    const projectId = created.json<{ data: { id: string } }>().data.id;
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { projectId, archivedAt: null },
    });
    return { projectId, conversationId: conversation.id };
  }

  const addMessage = (
    conversationId: string,
    data: {
      role?: "user" | "assistant";
      status?: "complete" | "streaming";
      content?: string;
      createdAt?: Date;
    } = {},
  ) =>
    prisma.message.create({
      data: {
        conversationId,
        role: data.role ?? "user",
        status: data.status ?? "complete",
        content: data.content ?? "hello",
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
    });

  const backdate = (messageId: string, minutesAgo: number) =>
    prisma.$executeRaw`UPDATE messages SET updated_at = now() - make_interval(mins => ${minutesAgo}) WHERE id = ${messageId}::uuid`;

  const activeCount = (projectId: string) =>
    prisma.conversation.count({ where: { projectId, archivedAt: null } });

  it("returns the active conversation with ordered, contract-valid messages", async () => {
    const { projectId, conversationId } = await newProject();
    const base = Date.now();
    await addMessage(conversationId, {
      content: "second",
      role: "assistant",
      createdAt: new Date(base + 2000),
    });
    await addMessage(conversationId, {
      content: "first",
      createdAt: new Date(base + 1000),
    });

    const response = await call(
      "GET",
      `/projects/${projectId}/conversations/active`,
      cookie,
    );

    expect(response.statusCode).toBe(200);
    const { data } = response.json<{ data: ActiveConversation }>();
    expect(() => ActiveConversationSchema.parse(data)).not.toThrow();
    expect(data).toMatchObject({ id: conversationId, projectId });
    expect(data.messages.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("resets: archives the old conversation, returns an empty new one, keeps exactly one active", async () => {
    const { projectId, conversationId } = await newProject();
    await addMessage(conversationId);

    const response = await call(
      "POST",
      `/projects/${projectId}/conversations`,
      cookie,
    );

    expect(response.statusCode).toBe(201);
    const { data } = response.json<{ data: ActiveConversation }>();
    expect(() => ActiveConversationSchema.parse(data)).not.toThrow();
    expect(data.id).not.toBe(conversationId);
    expect(data.messages).toEqual([]);
    const old = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(old.archivedAt).not.toBeNull();
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    expect(await activeCount(projectId)).toBe(1);
  });

  it("resolves concurrent resets without error and leaves one active conversation", async () => {
    const { projectId } = await newProject();

    const [a, b] = await Promise.all([
      call("POST", `/projects/${projectId}/conversations`, cookie),
      call("POST", `/projects/${projectId}/conversations`, cookie),
    ]);

    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(await activeCount(projectId)).toBe(1);
  });

  it("rejects a reset during a fresh stream with 409 and changes nothing", async () => {
    const { projectId, conversationId } = await newProject();
    await addMessage(conversationId, {
      role: "assistant",
      status: "streaming",
      content: "",
    });

    const response = await call(
      "POST",
      `/projects/${projectId}/conversations`,
      cookie,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(conversation.archivedAt).toBeNull();
    expect(await activeCount(projectId)).toBe(1);
  });

  it("returns a stale streaming row as error / AI_TIMEOUT and stores it, while a fresh one stays streaming", async () => {
    const stale = await newProject();
    const staleMessage = await addMessage(stale.conversationId, {
      role: "assistant",
      status: "streaming",
      content: "partial",
    });
    await backdate(staleMessage.id, 10);
    const fresh = await newProject();
    const freshMessage = await addMessage(fresh.conversationId, {
      role: "assistant",
      status: "streaming",
      content: "",
    });

    const staleResponse = await call(
      "GET",
      `/projects/${stale.projectId}/conversations/active`,
      cookie,
    );
    const freshResponse = await call(
      "GET",
      `/projects/${fresh.projectId}/conversations/active`,
      cookie,
    );

    const [flipped] = staleResponse.json<{ data: ActiveConversation }>().data
      .messages;
    expect(flipped).toMatchObject({
      status: "error",
      errorCode: "AI_TIMEOUT",
      content: "partial",
    });
    const stored = await prisma.message.findUniqueOrThrow({
      where: { id: staleMessage.id },
    });
    expect(stored).toMatchObject({ status: "error", errorCode: "AI_TIMEOUT" });
    expect(
      freshResponse.json<{ data: ActiveConversation }>().data.messages[0],
    ).toMatchObject({ status: "streaming", errorCode: null });
    expect(
      (
        await prisma.message.findUniqueOrThrow({
          where: { id: freshMessage.id },
        })
      ).status,
    ).toBe("streaming");
  });

  it("lets reset and project delete proceed when the only streaming row is stale", async () => {
    const forReset = await newProject();
    const m1 = await addMessage(forReset.conversationId, {
      role: "assistant",
      status: "streaming",
    });
    await backdate(m1.id, 10);
    const forDelete = await newProject();
    const m2 = await addMessage(forDelete.conversationId, {
      role: "assistant",
      status: "streaming",
    });
    await backdate(m2.id, 10);

    const reset = await call(
      "POST",
      `/projects/${forReset.projectId}/conversations`,
      cookie,
    );
    const del = await call(
      "DELETE",
      `/projects/${forDelete.projectId}`,
      cookie,
    );

    expect(reset.statusCode).toBe(201);
    expect(del.statusCode).toBe(204);
  });

  it("returns 404 for another user's project on both endpoints, changing nothing", async () => {
    const { projectId } = await newProject();

    const get = await call(
      "GET",
      `/projects/${projectId}/conversations/active`,
      otherCookie,
    );
    const reset = await call(
      "POST",
      `/projects/${projectId}/conversations`,
      otherCookie,
    );
    const missing = await call(
      "GET",
      `/projects/${MISSING_ID}/conversations/active`,
      cookie,
    );

    for (const response of [get, reset, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json<{ code: string }>().code).toBe("NOT_FOUND");
    }
    expect(await activeCount(projectId)).toBe(1);
    expect(await prisma.conversation.count({ where: { projectId } })).toBe(1);
  });

  describe("Origin check on mutating requests (CSRF)", () => {
    const reset = (projectId: string, origin?: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/conversations`,
        headers: { cookie, ...(origin ? { origin } : {}) },
      });

    it("rejects a POST from a foreign Origin with 403 FORBIDDEN and changes nothing", async () => {
      const { projectId, conversationId } = await newProject();

      const response = await reset(projectId, "http://evil.example");

      expect(response.statusCode).toBe(403);
      expect(response.json<{ code: string }>().code).toBe("FORBIDDEN");
      expect(
        (
          await prisma.conversation.findUniqueOrThrow({
            where: { id: conversationId },
          })
        ).archivedAt,
      ).toBeNull();
    });

    it("allows the configured Origin and requests without an Origin header", async () => {
      const first = await newProject();
      const second = await newProject();

      expect(
        (await reset(first.projectId, "http://localhost:5173")).statusCode,
      ).toBe(201);
      expect((await reset(second.projectId)).statusCode).toBe(201);
    });

    it("also guards PATCH and DELETE, and leaves GET alone", async () => {
      const { projectId } = await newProject();
      const evil = { cookie, origin: "http://evil.example" };

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: evil,
        payload: { title: "x" },
      });
      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}`,
        headers: evil,
      });
      const get = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}`,
        headers: evil,
      });

      expect([patch.statusCode, del.statusCode, get.statusCode]).toEqual([
        403, 403, 200,
      ]);
    });
  });

  it("returns 400 for a malformed project id and 401 without a session", async () => {
    const bad = await call(
      "GET",
      "/projects/nope/conversations/active",
      cookie,
    );
    const anonGet = await call(
      "GET",
      `/projects/${MISSING_ID}/conversations/active`,
    );
    const anonReset = await call(
      "POST",
      `/projects/${MISSING_ID}/conversations`,
    );

    expect(bad.statusCode).toBe(400);
    expect(anonGet.statusCode).toBe(401);
    expect(anonReset.statusCode).toBe(401);
    expect(anonGet.json<{ code: string }>().code).toBe("UNAUTHORIZED");
  });
});
