import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED_USER } from "../prisma/seed-user";
import {
  createTestApp,
  nextClientIp,
  signInCookie,
  TEST_ORIGIN as ORIGIN,
} from "./support/create-test-app";
import { ProtectedTestController } from "./support/protected-test.controller";

describe("SessionGuard (e2e, real Postgres)", () => {
  let app: NestFastifyApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp([ProtectedTestController]));
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  const signIn = (): Promise<string> =>
    signInCookie(app, SEED_USER.email, SEED_USER.password);

  it("returns 401 with the UNAUTHORIZED envelope without a cookie", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/test-protected",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      message: expect.any(String) as string,
      code: "UNAUTHORIZED",
    });
  });

  it("returns 200 with the session user for the seed user's cookie", async () => {
    const cookie = await signIn();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/test-protected",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        email: SEED_USER.email,
        name: SEED_USER.name,
      }) as unknown,
    });
  });

  it("keeps health public", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).not.toBe(401);
  });

  it("rejects the old cookie after sign-out", async () => {
    const cookie = await signIn();

    const signOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-out",
      remoteAddress: nextClientIp(),
      headers: {
        origin: ORIGIN,
        cookie,
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/test-protected",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });

  it("serves Swagger publicly and documents cookie auth", async () => {
    const docs = await app.inject({ method: "GET", url: "/api/docs" });
    const json = await app.inject({ method: "GET", url: "/api/docs-json" });

    expect(docs.statusCode).toBe(200);
    expect(json.statusCode).toBe(200);
    const securitySchemes = json.json<{
      components: { securitySchemes: Record<string, unknown> };
    }>().components.securitySchemes;
    expect(securitySchemes["cookie"]).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
    });
  });
});
