import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { TEST_DATABASE_URL } from "./support/test-database";

describe("database schema", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createProject(): Promise<{
    userId: string;
    projectId: string;
    conversationId: string;
  }> {
    const user = await prisma.user.create({
      data: {
        name: "Schema Test",
        email: `schema-${crypto.randomUUID()}@lmesh.test`,
      },
    });
    const project = await prisma.project.create({
      data: { ownerId: user.id, title: "Concept" },
    });
    const conversation = await prisma.conversation.create({
      data: { projectId: project.id },
    });
    return {
      userId: user.id,
      projectId: project.id,
      conversationId: conversation.id,
    };
  }

  it("cascades a user delete to projects, conversations and messages", async () => {
    const { userId, projectId, conversationId } = await createProject();
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: "hello",
        status: "complete",
      },
    });

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.project.count({ where: { id: projectId } })).toBe(0);
    expect(
      await prisma.conversation.count({ where: { id: conversationId } }),
    ).toBe(0);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
  });

  it("rejects a second active conversation for the same project", async () => {
    const { projectId, userId } = await createProject();

    await expect(
      prisma.conversation.create({ data: { projectId } }),
    ).rejects.toSatisfy(isUniqueViolation);

    await prisma.user.delete({ where: { id: userId } });
  });

  it("allows a new active conversation once the previous one is archived", async () => {
    const { projectId, conversationId, userId } = await createProject();

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { archivedAt: new Date() },
    });
    await expect(
      prisma.conversation.create({ data: { projectId } }),
    ).resolves.toBeDefined();

    await prisma.user.delete({ where: { id: userId } });
  });

  it("rejects a second streaming message in the same conversation", async () => {
    const { conversationId, userId } = await createProject();
    const streaming = {
      conversationId,
      role: "assistant" as const,
      content: "",
      status: "streaming" as const,
    };
    await prisma.message.create({ data: streaming });

    await expect(prisma.message.create({ data: streaming })).rejects.toSatisfy(
      isUniqueViolation,
    );
    await expect(
      prisma.message.create({
        data: { ...streaming, status: "complete", content: "ok" },
      }),
    ).resolves.toBeDefined();

    await prisma.user.delete({ where: { id: userId } });
  });
});

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  // Partial indexes are unknown to Prisma, so the driver adapter may surface the raw Postgres error.
  return /unique|23505|duplicate/i.test(String((error as Error)?.message));
}
