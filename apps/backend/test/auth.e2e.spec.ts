import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureCredentialUser, SEED_USER, seedUser } from "../prisma/seed-user";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, TEST_ORIGIN } from "./support/create-test-app";

const ORIGIN = TEST_ORIGIN;

// Each test uses its own client IP so the in-memory rate limiter does not leak between tests.
let ipCounter = 0;
const nextIp = (): string => `10.9.0.${++ipCounter}`;

describe("auth (e2e, real Postgres)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp());
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  const signIn = (
    password: string,
    ip = nextIp(),
    email: string = SEED_USER.email,
    extraHeaders: Record<string, string> = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in/email",
      remoteAddress: ip,
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...extraHeaders,
      },
      payload: { email, password },
    });

  it("signs in the seed user with an HttpOnly, SameSite=Lax cookie and returns the session", async () => {
    const response = await signIn(SEED_USER.password);

    expect(response.statusCode).toBe(200);
    const setCookie = [response.headers["set-cookie"]].flat().join("; ");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    // FR-AUTH-06: sessions last 7 days.
    expect(setCookie).toMatch(/Max-Age=604800\b/);
    // Plain-http base URL: no Secure flag, so local/docker use keeps working.
    expect(setCookie).not.toMatch(/;\s*Secure/i);
    // better-auth's own body, not the { data } envelope.
    expect(response.json()).toMatchObject({
      user: { email: SEED_USER.email, name: SEED_USER.name },
    });

    const cookie = [response.headers["set-cookie"]]
      .flat()
      .map((c) => String(c).split(";")[0])
      .join("; ");
    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/get-session",
      headers: { origin: ORIGIN, cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      user: { email: SEED_USER.email },
    });
  });

  it("returns null from get-session when signed out", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/get-session",
      headers: { origin: ORIGIN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it("returns 401 with a generic message for a wrong password or unknown email", async () => {
    const wrongPassword = await signIn("not-the-password");
    const unknownEmail = await signIn("password", nextIp(), "nobody@lmesh.eu");

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json<{ message: string }>().message).toBe(
      unknownEmail.json<{ message: string }>().message,
    );
    expect(wrongPassword.body).not.toMatch(/not found|wrong password/i);
  });

  it("does not create a user on sign-up", async () => {
    const email = `signup-${crypto.randomUUID()}@lmesh.test`;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-up/email",
      remoteAddress: nextIp(),
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: { email, password: "password123", name: "Intruder" },
    });

    // better-auth's own body, not our envelope: exact status and code.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Email and password sign up is not enabled",
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("rate limits the 6th sign-in within 60 seconds with 429", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await signIn("wrong-password", ip)).statusCode);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("keeps limiting one socket address even when a client-supplied x-real-ip rotates", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const spoofed = { "x-real-ip": `198.51.100.${attempt + 1}` };
      statuses.push(
        (await signIn("wrong-password", ip, SEED_USER.email, spoofed))
          .statusCode,
      );
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("seeds concurrently without duplicating the credential account", async () => {
    const credentials = {
      email: `concurrent-${crypto.randomUUID()}@lmesh.test`,
      name: "Concurrent",
      password: "password-123",
    };

    const [first, second] = await Promise.all([
      ensureCredentialUser(prisma, credentials),
      ensureCredentialUser(prisma, credentials),
    ]);

    expect(first).toBe(second);
    expect(await prisma.account.count({ where: { userId: first } })).toBe(1);
    await prisma.user.delete({ where: { id: first } });
  });

  it("seeds idempotently: one user and one credential account after two runs", async () => {
    await seedUser(prisma);
    await seedUser(prisma);

    const user = await prisma.user.findMany({
      where: { email: SEED_USER.email },
      include: { accounts: true },
    });
    expect(user).toHaveLength(1);
    expect(
      user[0]?.accounts.filter((a) => a.providerId === "credential"),
    ).toHaveLength(1);
    expect(user[0]?.accounts[0]?.accountId).toBe(user[0]?.id);
  });
});
