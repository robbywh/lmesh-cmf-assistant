import { ErrorCode, SseEventType, type SseEvent } from "@lmesh/api-contract";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SEED_PROJECT_IDS } from "@/mocks/fixtures";
import { mockStore, setStreamScenario, signInMock } from "@/mocks/mock-store";
import { server } from "@/mocks/server";

import { ApiError } from "@/lib/api-error";

import { streamChat } from "./stream-chat";

const params = { projectId: SEED_PROJECT_IDS.ev };
const body = { content: "hello" };

async function collect(iterator: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of iterator) events.push(event);
  return events;
}

describe("streamChat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("yields message.created, tokens and done in order", async () => {
    signInMock();

    const events = await collect(await streamChat("sendMessage", { params, body }));

    const types = events.map((event) => event.type);
    expect(types[0]).toBe(SseEventType.MESSAGE_CREATED);
    expect(types.at(-1)).toBe(SseEventType.DONE);
    expect(types.filter((type) => type === SseEventType.TOKEN).length).toBeGreaterThan(0);
  });

  it("yields an error event last for an error-midstream scenario", async () => {
    signInMock();
    setStreamScenario({ kind: "error-midstream", code: ErrorCode.AI_TIMEOUT });

    const events = await collect(await streamChat("sendMessage", { params, body }));

    expect(events.at(-1)).toMatchObject({ type: "error", code: ErrorCode.AI_TIMEOUT });
  });

  it("throws the JSON error as ApiError before any event", async () => {
    signInMock();
    mockStore.openStreams.add(SEED_PROJECT_IDS.ev);

    await expect(streamChat("sendMessage", { params, body })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: ErrorCode.STREAM_IN_PROGRESS,
    });
  });

  it("skips unknown event names and ignores pings", async () => {
    server.use(
      http.post(
        "/api/v1/projects/:projectId/summaries",
        () =>
          new HttpResponse(
            ': ping\n\nevent: custom\ndata: {"x":1}\n\n' +
              `event: token\ndata: ${JSON.stringify({
                type: "token",
                messageId: "c0000000-0000-4000-8000-000000000001",
                delta: "hi",
              })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          ),
      ),
    );

    const events = await collect(await streamChat("summarise", { params }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "token", delta: "hi" });
  });

  it("throws INTERNAL_ERROR for an invalid payload", async () => {
    server.use(
      http.post(
        "/api/v1/projects/:projectId/summaries",
        () =>
          new HttpResponse('event: token\ndata: {"type":"token","delta":""}\n\n', {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );

    const iterator = await streamChat("summarise", { params });

    await expect(collect(iterator)).rejects.toMatchObject({
      name: "ApiError",
      code: ErrorCode.INTERNAL_ERROR,
    });
  });

  it("rejects with an AbortError when aborted mid-stream", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 50 });
    const controller = new AbortController();

    const iterator = await streamChat("sendMessage", {
      params,
      body,
      signal: controller.signal,
    });
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: "message.created" });
    controller.abort();

    await expect(collect(iterator)).rejects.toMatchObject({ name: "AbortError" });
  });

  describe("failure modes", () => {
    const sse = (body: BodyInit) =>
      new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
    const summarise = (response: () => Response) =>
      server.use(http.post("/api/v1/projects/:projectId/summaries", response));
    const tokenFrame = (extra: object = {}) =>
      `event: token\ndata: ${JSON.stringify({
        type: "token",
        messageId: "c0000000-0000-4000-8000-000000000001",
        delta: "hi",
        ...extra,
      })}\n\n`;

    it("maps a read error mid-stream to ApiError(INTERNAL_ERROR, 'Stream connection lost')", async () => {
      // MSW closes a failing body cleanly, so this one case stubs fetch with a body that errors.
      const encoder = new TextEncoder();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          let sent = false;
          return new Response(
            new ReadableStream({
              pull(controller) {
                if (sent) return controller.error(new Error("socket reset"));
                sent = true;
                controller.enqueue(encoder.encode(tokenFrame()));
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }),
      );
      const iterator = await streamChat("summarise", { params });

      const events: SseEvent[] = [];
      const failure = await (async () => {
        for await (const event of iterator) events.push(event);
      })().catch((e: unknown) => e);
      vi.unstubAllGlobals();

      expect(events).toHaveLength(1);
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Stream connection lost",
      });
    });

    it("maps a rejected fetch to ApiError(INTERNAL_ERROR)", async () => {
      summarise(() => HttpResponse.error());

      await expect(streamChat("summarise", { params })).rejects.toMatchObject({
        name: "ApiError",
        status: 0,
        code: ErrorCode.INTERNAL_ERROR,
      });
    });

    it("throws INTERNAL_ERROR for malformed JSON in data", async () => {
      summarise(() => sse("event: token\ndata: {not json\n\n"));
      const iterator = await streamChat("summarise", { params });

      await expect(collect(iterator)).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Malformed stream event",
      });
    });

    it("throws INTERNAL_ERROR when the event name differs from the payload type", async () => {
      summarise(() => sse(tokenFrame().replace("event: token", "event: done")));
      const iterator = await streamChat("summarise", { params });

      await expect(collect(iterator)).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Invalid stream event payload",
      });
    });

    it("ends silently when the stream closes without done or error (the caller decides)", async () => {
      summarise(() => sse(tokenFrame()));
      const iterator = await streamChat("summarise", { params });

      const events = await collect(iterator);

      expect(events.map((event) => event.type)).toEqual(["token"]);
    });
  });
});
