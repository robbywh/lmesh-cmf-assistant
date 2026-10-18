import { describe, expect, it, vi } from "vitest";

import {
  markStaleStreamingAsError,
  STALE_STREAM_GRACE_MS,
  staleStreamingCutoff,
} from "./stale-stream.util";

describe("staleStreamingCutoff", () => {
  it("is now minus the request timeout minus 30 seconds", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");

    const cutoff = staleStreamingCutoff(now, 120_000);

    expect(STALE_STREAM_GRACE_MS).toBe(30_000);
    expect(cutoff.toISOString()).toBe("2026-01-01T00:07:30.000Z");
  });
});

describe("markStaleStreamingAsError", () => {
  const cutoff = new Date("2026-01-01T00:00:00.000Z");

  it("flips old streaming rows of a project to error / AI_TIMEOUT", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    const count = await markStaleStreamingAsError(
      { message: { updateMany } } as never,
      { projectId: "p1" },
      cutoff,
    );

    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: "streaming",
        updatedAt: { lt: cutoff },
        conversation: { projectId: "p1" },
      },
      data: { status: "error", errorCode: "AI_TIMEOUT" },
    });
  });

  it("can be scoped to one conversation", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    await markStaleStreamingAsError(
      { message: { updateMany } } as never,
      { conversationId: "c1" },
      cutoff,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: "c1" }) as object,
      }),
    );
  });
});
