import type { Message } from "@lmesh/api-contract";
import { describe, expect, it } from "vitest";

import { SseWriter, type SseSink } from "./sse-writer.util";

class FakeSink implements SseSink {
  chunks: string[] = [];
  writableEnded = false;
  destroyed = false;
  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  public end(): void {
    this.writableEnded = true;
  }
}

const ID = "5eed0003-0000-4000-8000-000000000001";
const message: Message = {
  id: ID,
  conversationId: ID,
  role: "assistant",
  kind: "chat",
  content: "",
  status: "streaming",
  errorCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("SseWriter", () => {
  it("formats an event as `event: <type>\\ndata: <json>\\n\\n`", () => {
    const sink = new FakeSink();

    new SseWriter(sink).event({ type: "token", messageId: ID, delta: "Hi" });

    expect(sink.chunks).toEqual([
      `event: token\ndata: {"type":"token","messageId":"${ID}","delta":"Hi"}\n\n`,
    ]);
  });

  it("formats a comment as `: <text>\\n\\n`", () => {
    const sink = new FakeSink();

    new SseWriter(sink).comment("ping");

    expect(sink.chunks).toEqual([": ping\n\n"]);
  });

  it("rejects an event that does not match the contract when validation is on", () => {
    const writer = new SseWriter(new FakeSink(), { validate: true });

    expect(() =>
      writer.event({ type: "token", messageId: ID, delta: "" }),
    ).toThrow();
    expect(() => writer.event({ type: "done", message })).not.toThrow();
  });

  it("ignores writes after close and closes only once", () => {
    const sink = new FakeSink();
    const writer = new SseWriter(sink);

    writer.close();
    writer.event({ type: "token", messageId: ID, delta: "late" });
    writer.comment("late");
    writer.close();

    expect(sink.chunks).toEqual([]);
    expect(writer.closed).toBe(true);
  });

  it("reports closed when the connection is destroyed", () => {
    const sink = new FakeSink();
    sink.destroyed = true;
    const writer = new SseWriter(sink);

    writer.comment("ping");

    expect(writer.closed).toBe(true);
    expect(sink.chunks).toEqual([]);
  });
});
