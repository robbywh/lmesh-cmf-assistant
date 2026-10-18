import {
  ErrorCode,
  ProjectListSchema,
  type ErrorEnvelope,
} from "@lmesh/api-contract";
import { describe, expect, it } from "vitest";

import { server } from "@/mocks/server";

import { SEED_PROJECT_IDS } from "./fixtures";
import { errorHandler } from "./handlers";
import { mockStore, setStreamScenario, signInMock } from "./mock-store";

const json = (init: RequestInit & { path: string }) =>
  fetch(`/api/v1${init.path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });

describe("mock handlers", () => {
  it("returns 401 UNAUTHORIZED for projects when signed out", async () => {
    const response = await json({ path: "/projects" });

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorEnvelope).code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("returns the three seed projects when signed in", async () => {
    signInMock();

    const body = (await (await json({ path: "/projects" })).json()) as { data: unknown };

    expect(ProjectListSchema.parse(body.data)).toHaveLength(3);
  });

  it("signs in with the seed user and rejects wrong credentials", async () => {
    const bad = await json({
      path: "/auth/sign-in/email",
      method: "POST",
      body: JSON.stringify({ email: "test@lmesh.eu", password: "nope" }),
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({
      message: "Invalid email or password",
      code: "INVALID_EMAIL_OR_PASSWORD",
    });

    const good = await json({
      path: "/auth/sign-in/email",
      method: "POST",
      body: JSON.stringify({ email: "test@lmesh.eu", password: "password" }),
    });
    expect(good.status).toBe(200);
    const session = (await (await json({ path: "/auth/get-session" })).json()) as {
      user: { name: string };
    };
    expect(session.user.name).toBe("Test Designer");
  });

  it("returns 404 for an unknown project", async () => {
    signInMock();

    const response = await json({
      path: "/projects/b0000000-0000-4000-8000-0000000000ff/conversations/active",
    });

    expect(response.status).toBe(404);
  });

  it("validates the create project body", async () => {
    signInMock();

    const response = await json({ path: "/projects", method: "POST", body: "{}" });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorEnvelope).errors).toHaveProperty("title");
  });

  it("streams a reply, persists it, and rejects a second stream while one is open", async () => {
    signInMock();
    const path = `/projects/${SEED_PROJECT_IDS.ev}`;
    setStreamScenario({ kind: "success", tokenDelayMs: 20 });

    const first = await json({
      path: `${path}/messages`,
      method: "POST",
      body: JSON.stringify({ content: "hello" }),
    });
    expect(first.headers.get("Content-Type")).toContain("text/event-stream");

    const second = await json({
      path: `${path}/messages`,
      method: "POST",
      body: JSON.stringify({ content: "again" }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as ErrorEnvelope).code).toBe(ErrorCode.STREAM_IN_PROGRESS);

    await first.text();
    expect(mockStore.openStreams.size).toBe(0);
    const conversation = (await (await json({ path: `${path}/conversations/active` })).json()) as {
      data: { messages: { role: string; status: string }[] };
    };
    expect(conversation.data.messages.map((m) => `${m.role}:${m.status}`)).toEqual([
      "user:complete",
      "assistant:complete",
    ]);
  });

  it("answers pre-stream errors as JSON", async () => {
    signInMock();
    setStreamScenario({
      kind: "pre-stream-error",
      status: 503,
      code: ErrorCode.AI_UNAVAILABLE,
    });

    const response = await json({
      path: `/projects/${SEED_PROJECT_IDS.ev}/messages`,
      method: "POST",
      body: JSON.stringify({ content: "hello" }),
    });

    expect(response.status).toBe(503);
    expect(((await response.json()) as ErrorEnvelope).code).toBe(ErrorCode.AI_UNAVAILABLE);
  });

  it("supports per-test overrides through server.use", async () => {
    signInMock();
    server.use(errorHandler("listProjects", 500, ErrorCode.INTERNAL_ERROR));

    expect((await json({ path: "/projects" })).status).toBe(500);
  });

  it("fails on unhandled requests", async () => {
    // fetch wraps MSW's error as `cause`; ECONNREFUSED would mean the request escaped MSW.
    const error = await fetch("/api/v1/unknown").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(String((error as Error).cause)).toMatch(/\[MSW\].*"error" strategy/);
    expect(String((error as Error).cause)).not.toMatch(/ECONNREFUSED/);
  });
});
