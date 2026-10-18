import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { ErrorCode } from "../src/common/exceptions";
import { PrismaService } from "../src/prisma/prisma.service";
import { setupApp } from "../src/setup-app.util";

describe("GET /api/v1/health (e2e, database mocked)", () => {
  let app: NestFastifyApplication;
  const prismaMock = {
    $queryRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    setupApp(app, "http://localhost:5173");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the success envelope when the database responds", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        status: "ok",
        database: "up",
      }) as unknown,
    });
  });

  it("returns 503 with DATABASE_UNAVAILABLE when the database is down", async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      message: "Database is unavailable",
      code: ErrorCode.DATABASE_UNAVAILABLE,
    });
  });

  it("returns the error envelope for unknown routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/does-not-exist",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});
