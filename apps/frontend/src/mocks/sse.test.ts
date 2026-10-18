import { ErrorCode, SseEventSchema, SseEventType, type SseEvent } from "@lmesh/api-contract";
import { describe, expect, it } from "vitest";

import { buildMessage } from "./fixtures";
import { SSE_PING, createSseResponse, scenarioEvents, type StreamingScenario } from "./sse";

const conversationId = "c0000000-0000-4000-8000-000000000099";

async function readStream(scenario: StreamingScenario) {
  const assistantMessage = buildMessage(conversationId, {
    role: "assistant",
    content: "",
    status: "streaming",
  });
  const response = createSseResponse(
    scenarioEvents(scenario, {
      userMessage: null,
      assistantMessage,
      tokenDelayMs: 0,
      defaultTokens: ["a", "b"],
    }),
  );
  const raw = await response.text();
  const events = raw
    .split("\n\n")
    .filter((frame) => frame.startsWith("event: "))
    .map((frame) => {
      const [eventLine, dataLine] = frame.split("\n");
      const event = SseEventSchema.parse(JSON.parse(dataLine!.slice("data: ".length)));
      expect(eventLine).toBe(`event: ${event.type}`);
      return event;
    });
  return { response, raw, events };
}

const types = (events: SseEvent[]) => events.map((event) => event.type);

describe("SSE mock helper", () => {
  it("emits message.created, tokens and done for a success stream", async () => {
    const { response, events } = await readStream({ kind: "success" });

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(types(events)).toEqual([
      SseEventType.MESSAGE_CREATED,
      SseEventType.TOKEN,
      SseEventType.TOKEN,
      SseEventType.DONE,
    ]);
    const done = events.at(-1);
    expect(done?.type === "done" && done.message).toMatchObject({
      content: "ab",
      status: "complete",
    });
  });

  it("ends with error after partial tokens for the error variant", async () => {
    const { events } = await readStream({
      kind: "error-midstream",
      code: ErrorCode.AI_TIMEOUT,
    });

    expect(types(events).at(-1)).toBe(SseEventType.ERROR);
    expect(events.at(-1)).toMatchObject({ code: ErrorCode.AI_TIMEOUT });
    expect(types(events)).toContain(SseEventType.TOKEN);
  });

  it("writes a ping comment when requested", async () => {
    const { raw } = await readStream({ kind: "success", ping: true });

    expect(raw).toContain(SSE_PING);
  });
});
