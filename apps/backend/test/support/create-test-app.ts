import type { Type } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import {
  DEFAULT_TRUST_PROXY,
  parseTrustProxy,
} from "../../src/config/trust-proxy.util";
import { setupApp, setupSwagger } from "../../src/setup-app.util";
import { TEST_DATABASE_URL } from "./test-database";

export const TEST_ORIGIN = "http://localhost:5173";

export interface TestApp {
  app: NestFastifyApplication;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule on Fastify against the test database, which
 * `test/global-setup.ts` has already created, migrated and seeded. Env is set before `app.module` is imported because ConfigModule
 * validates at import time.
 * @param extraControllers Test-only controllers to register next to AppModule.
 * @param providerOverrides Providers to replace by token (e.g. `AI_PROVIDER`).
 */
export async function createTestApp(
  extraControllers: Type<unknown>[] = [],
  providerOverrides: { token: unknown; value: unknown }[] = [],
): Promise<TestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.CORS_ORIGIN = TEST_ORIGIN;
  process.env.BETTER_AUTH_URL = TEST_ORIGIN;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });

  const { AppModule } = await import("../../src/app.module");
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
  for (const { token, value } of providerOverrides) {
    builder = builder.overrideProvider(token as never).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({
      trustProxy: parseTrustProxy(DEFAULT_TRUST_PROXY),
    }),
  );
  setupApp(app, TEST_ORIGIN);
  setupSwagger(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

let ipCounter = 0;

/**
 * A fresh socket address per call (use as `remoteAddress` in `app.inject`) so the
 * in-memory sign-in rate limiter, keyed on the resolved client IP, never trips.
 */
export const nextClientIp = (): string =>
  `10.7.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

/**
 * Signs in through the real endpoint.
 * @returns A `Cookie` header value for follow-up requests.
 */
export async function signInCookie(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sign-in/email",
    remoteAddress: nextClientIp(),
    headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign-in failed with ${response.statusCode}`);
  }
  return [response.headers["set-cookie"]]
    .flat()
    .map((cookie) => String(cookie).split(";")[0])
    .join("; ");
}
