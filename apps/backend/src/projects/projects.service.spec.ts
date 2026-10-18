import { describe, expect, it, vi } from "vitest";

import {
  NotFoundException,
  StreamInProgressException,
} from "../common/exceptions";
import type { StaleStreamService } from "../conversations/stale-stream.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "./projects.service";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const row = (overrides: object = {}) => ({
  id: "p1",
  ownerId: "u1",
  title: "T",
  description: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

function setup() {
  const prisma = {
    project: {
      findMany: vi.fn().mockResolvedValue([row()]),
      findFirst: vi.fn().mockResolvedValue(row()),
      create: vi.fn().mockResolvedValue(row()),
      update: vi.fn().mockResolvedValue(row()),
      delete: vi.fn().mockResolvedValue(row()),
    },
    message: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  const staleStreams = { markStale: vi.fn().mockResolvedValue(0) };
  return {
    prisma,
    staleStreams,
    service: new ProjectsService(
      prisma as unknown as PrismaService,
      staleStreams as unknown as StaleStreamService,
    ),
  };
}

describe("ProjectsService", () => {
  it("stores an empty description as null on create and creates one conversation", async () => {
    const { service, prisma } = setup();

    await service.create("u1", { title: "T", description: "" });

    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        ownerId: "u1",
        title: "T",
        description: null,
        conversations: { create: {} },
      },
    });
  });

  it("stores an empty description as null on update and leaves omitted fields alone", async () => {
    const { service, prisma } = setup();

    await service.update("u1", "p1", { description: "" });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { description: null },
    });
  });

  it("scopes every lookup by owner and maps rows to ISO strings", async () => {
    const { service, prisma } = setup();

    const list = await service.list("u1");
    await service.get("u1", "p1");

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: "u1" },
      orderBy: { updatedAt: "desc" },
    });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "u1" },
    });
    expect(list[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws NotFoundException for a missing or foreign project", async () => {
    const { service, prisma } = setup();
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.get("u2", "p1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove("u2", "p1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });

  it("flips stale streaming rows before checking for a live stream on delete", async () => {
    const { service, staleStreams } = setup();

    await service.remove("u1", "p1");

    expect(staleStreams.markStale).toHaveBeenCalledWith(expect.anything(), {
      projectId: "p1",
    });
  });

  it("locks the project row, then checks for a stream, then deletes, all in one transaction", async () => {
    const { service, prisma } = setup();

    await service.remove("u1", "p1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const lock = prisma.$queryRaw.mock.invocationCallOrder[0]!;
    const check = prisma.message.findFirst.mock.invocationCallOrder[0]!;
    const del = prisma.project.delete.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(check);
    expect(check).toBeLessThan(del);
  });

  it("refuses to delete while a message is streaming", async () => {
    const { service, prisma } = setup();
    prisma.message.findFirst.mockResolvedValue({ id: "m1" });

    await expect(service.remove("u1", "p1")).rejects.toBeInstanceOf(
      StreamInProgressException,
    );
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });
});
