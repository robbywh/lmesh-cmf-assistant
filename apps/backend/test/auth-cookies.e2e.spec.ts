import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED_USER } from "../prisma/seed-user";
import { createAuth } from "../src/auth/auth.config";
import { PrismaClient } from "../src/generated/prisma/client";
import { TEST_DATABASE_URL } from "./support/test-database";

const HTTPS_ORIGIN = "https://app.example.test";

describe("session cookie under an https base URL (FR-AUTH-06)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sets a Secure, HttpOnly, SameSite=Lax, 7-day cookie with the __Secure- prefix", async () => {
    const auth = createAuth({
      prisma,
      secret: "https-cookie-test-secret-0123456789abcdef",
      baseURL: HTTPS_ORIGIN,
      corsOrigin: HTTPS_ORIGIN,
    });

    const response = await auth.handler(
      new Request(`${HTTPS_ORIGIN}/api/v1/auth/sign-in/email`, {
        method: "POST",
        headers: {
          origin: HTTPS_ORIGIN,
          "content-type": "application/json",
          "x-real-ip": "10.6.0.1",
        },
        body: JSON.stringify({
          email: SEED_USER.email,
          password: SEED_USER.password,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.includes("session_token"));
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800\b/);
  });
});
