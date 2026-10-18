import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureCredentialUser } from "../prisma/seed-user";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, signInCookie } from "./support/create-test-app";

// Dedicated users: specs run in parallel on one database, so none may clean up another's data.
const MAIN_USER = {
  email: "projects-main@lmesh.test",
  name: "Projects Main",
  password: "main-password-1",
};
const OTHER_USER = {
  email: "other-designer@lmesh.test",
  name: "Other Designer",
  password: "other-password-1",
};

interface ProjectBody {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

describe("projects (e2e, real Postgres)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let cookie: string;
  let otherCookie: string;
  let seedUserId: string;

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp());
    await ensureCredentialUser(prisma, MAIN_USER);
    await ensureCredentialUser(prisma, OTHER_USER);
    seedUserId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: MAIN_USER.email },
      })
    ).id;
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
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    options: { cookie?: string; payload?: unknown } = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { ...(options.cookie ? { cookie: options.cookie } : {}) },
      ...(options.payload !== undefined
        ? { payload: options.payload as object }
        : {}),
    });

  const createProject = async (
    payload: object,
    as: string = cookie,
  ): Promise<ProjectBody> => {
    const response = await call("POST", "/projects", {
      cookie: as,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: ProjectBody }>().data;
  };

  it("creates a project (201 envelope) with exactly one active conversation", async () => {
    const response = await call("POST", "/projects", {
      cookie,
      payload: { title: "  Alpine EV  ", description: "Matte, cool tones" },
    });

    expect(response.statusCode).toBe(201);
    const { data } = response.json<{ data: ProjectBody }>();
    expect(data).toMatchObject({
      title: "Alpine EV",
      description: "Matte, cool tones",
    });
    expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
    expect(
      await prisma.conversation.count({
        where: { projectId: data.id, archivedAt: null },
      }),
    ).toBe(1);
  });

  it("stores a whitespace-only or empty description as null", async () => {
    const blank = await createProject({ title: "Blank", description: "   " });
    const empty = await createProject({ title: "Empty", description: "" });
    const missing = await createProject({ title: "Missing" });

    expect(blank.description).toBeNull();
    expect(empty.description).toBeNull();
    expect(missing.description).toBeNull();
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: blank.id },
    });
    expect(row.description).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["121 characters", "x".repeat(121)],
  ])(
    "rejects a %s title with VALIDATION_FAILED and errors.title",
    async (_n, title) => {
      const response = await call("POST", "/projects", {
        cookie,
        payload: { title },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{
        code: string;
        errors: Record<string, string[]>;
      }>();
      expect(body.code).toBe("VALIDATION_FAILED");
      expect(body.errors.title?.length).toBeGreaterThan(0);
    },
  );

  it("gets, updates and deletes an own project", async () => {
    const created = await createProject({ title: "Lifecycle" });

    const got = await call("GET", `/projects/${created.id}`, { cookie });
    expect(got.statusCode).toBe(200);
    expect(got.json<{ data: ProjectBody }>().data.id).toBe(created.id);

    const patched = await call("PATCH", `/projects/${created.id}`, {
      cookie,
      payload: { title: "Renamed", description: "" },
    });
    expect(patched.statusCode).toBe(200);
    const updated = patched.json<{ data: ProjectBody }>().data;
    expect(updated).toMatchObject({ title: "Renamed", description: null });
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    const removed = await call("DELETE", `/projects/${created.id}`, { cookie });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe("");
    expect(
      (await call("GET", `/projects/${created.id}`, { cookie })).statusCode,
    ).toBe(404);
  });

  it("rejects an empty PATCH body and a malformed project id with 400", async () => {
    const created = await createProject({ title: "Validation" });

    const empty = await call("PATCH", `/projects/${created.id}`, {
      cookie,
      payload: {},
    });
    const badId = await call("GET", "/projects/not-a-uuid", { cookie });

    expect(empty.statusCode).toBe(400);
    expect(empty.json<{ code: string }>().code).toBe("VALIDATION_FAILED");
    expect(badId.statusCode).toBe(400);
    expect(
      badId.json<{ errors: Record<string, string[]> }>().errors.projectId,
    ).toBeDefined();
  });

  it("returns 404 for another user's project on get, update and delete, changing nothing", async () => {
    const mine = await createProject({ title: "Private" });

    const get = await call("GET", `/projects/${mine.id}`, {
      cookie: otherCookie,
    });
    const patch = await call("PATCH", `/projects/${mine.id}`, {
      cookie: otherCookie,
      payload: { title: "Hijacked" },
    });
    const del = await call("DELETE", `/projects/${mine.id}`, {
      cookie: otherCookie,
    });

    for (const response of [get, patch, del]) {
      expect(response.statusCode).toBe(404);
      expect(response.json<{ code: string }>().code).toBe("NOT_FOUND");
    }
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: mine.id },
    });
    expect(row.title).toBe("Private");
    expect(row.ownerId).toBe(seedUserId);
  });

  it("lists only the caller's projects, updatedAt descending", async () => {
    const first = await createProject({ title: "List first" });
    const second = await createProject({ title: "List second" });
    const foreign = await createProject({ title: "Not mine" }, otherCookie);
    await call("PATCH", `/projects/${first.id}`, {
      cookie,
      payload: { title: "List first (edited)" },
    });

    const response = await call("GET", "/projects", { cookie });

    expect(response.statusCode).toBe(200);
    const list = response.json<{ data: ProjectBody[] }>().data;
    const ids = list.map((project) => project.id);
    expect(ids).not.toContain(foreign.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    const times = list.map((project) => project.updatedAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("refuses to delete a project while a message is streaming (409)", async () => {
    const created = await createProject({ title: "Streaming" });
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { projectId: created.id, archivedAt: null },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    });

    const response = await call("DELETE", `/projects/${created.id}`, {
      cookie,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe("STREAM_IN_PROGRESS");
    expect(await prisma.project.count({ where: { id: created.id } })).toBe(1);

    await prisma.message.updateMany({
      where: { conversationId: conversation.id },
      data: { status: "complete" },
    });
    expect(
      (await call("DELETE", `/projects/${created.id}`, { cookie })).statusCode,
    ).toBe(204);
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.id },
      }),
    ).toBe(0);
  });

  it("requires a session on every project route (401 UNAUTHORIZED)", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const responses = await Promise.all([
      call("GET", "/projects"),
      call("POST", "/projects", { payload: { title: "x" } }),
      call("GET", `/projects/${id}`),
      call("PATCH", `/projects/${id}`, { payload: { title: "x" } }),
      call("DELETE", `/projects/${id}`),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json<{ code: string }>().code).toBe("UNAUTHORIZED");
    }
  });

  it("documents the project endpoints in the OpenAPI document", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });

    const paths = Object.keys(response.json<{ paths: object }>().paths);
    expect(paths).toContain("/api/v1/projects");
    expect(paths).toContain("/api/v1/projects/{projectId}");
  });
});
