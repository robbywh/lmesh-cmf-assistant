import { describe, expect, it, vi } from "vitest";

import {
  NotFoundException,
  StreamInProgressException,
} from "../common/exceptions";
import type { PrismaService } from "../prisma/prisma.service";
import { ConversationsService } from "./conversations.service";
import type { StaleStreamService } from "./stale-stream.service";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function setup(options: { streaming?: boolean; owned?: boolean } = {}) {
  const tx = {
    message: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.streaming ? { id: "m1" } : null),
    },
    conversation: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi
        .fn()
        .mockResolvedValue({ id: "c2", projectId: "p1", createdAt: NOW }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    project: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.owned === false ? null : { id: "p1" }),
    },
    conversation: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const staleStreams = { markStale: vi.fn().mockResolvedValue(0) };
  const service = new ConversationsService(
    prisma as unknown as PrismaService,
    staleStreams as unknown as StaleStreamService,
  );
  return { service, prisma, tx, staleStreams };
}

describe("ConversationsService.reset", () => {
  it("archives the active conversation and creates a new one in one transaction", async () => {
    const { service, prisma, tx, staleStreams } = setup();

    const result = await service.reset("u1", "p1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The project row is locked first, so send/delete cannot interleave with the reset.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      staleStreams.markStale.mock.invocationCallOrder[0]!,
    );
    expect(staleStreams.markStale).toHaveBeenCalledWith(tx, {
      projectId: "p1",
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", archivedAt: null },
      data: { archivedAt: expect.any(Date) as Date },
    });
    expect(tx.conversation.create).toHaveBeenCalledWith({
      data: { projectId: "p1" },
    });
    expect(result).toMatchObject({ id: "c2", messages: [] });
  });

  it("rejects with StreamInProgressException during a fresh stream, changing nothing", async () => {
    const { service, tx } = setup({ streaming: true });

    await expect(service.reset("u1", "p1")).rejects.toBeInstanceOf(
      StreamInProgressException,
    );
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundException for a foreign project", async () => {
    const { service, prisma } = setup({ owned: false });

    await expect(service.reset("u2", "p1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("resolves a lost race (unique violation) to the winner's conversation", async () => {
    const { service, prisma, tx } = setup();
    tx.conversation.create.mockRejectedValue(
      new Error("Unique constraint failed"),
    );
    prisma.conversation.findFirst.mockResolvedValue({
      id: "c-winner",
      projectId: "p1",
      createdAt: NOW,
      messages: [],
    });

    await expect(service.reset("u1", "p1")).resolves.toMatchObject({
      id: "c-winner",
    });
  });
});
