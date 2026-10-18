import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiProviderErrorException,
  AiUnavailableException,
} from "../../common/exceptions";
import { GeminiAiProvider } from "./gemini-ai.provider";
import { captureLogs, drain, streamResponse } from "./provider-test.helpers";

const options = { apiKey: "AIza-test-key", model: "gemini-2.0-flash-lite" };
const sse = (text: string): string =>
  `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] } }] })}\n\n`;

describe("GeminiAiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is configured only with a non-empty key", () => {
    expect(new GeminiAiProvider(options).isConfigured()).toBe(true);
    expect(
      new GeminiAiProvider({ ...options, apiKey: "" }).isConfigured(),
    ).toBe(false);
  });

  it("sends the key in a header, not the URL, with systemInstruction and model/user roles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamResponse([sse("Hel"), sse("lo")]));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeminiAiProvider(options);

    const result: string[] = [];
    for await (const delta of provider.streamChat(
      [
        { role: "system", content: "Be a designer" },
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
      { signal: new AbortController().signal },
    )) {
      result.push(delta);
    }

    expect(result).toEqual(["Hel", "lo"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?alt=sse",
    );
    expect(url).not.toContain("AIza-test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "AIza-test-key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: "Be a designer" }] },
      contents: [
        { role: "user", parts: [{ text: "q1" }] },
        { role: "model", parts: [{ text: "a1" }] },
        { role: "user", parts: [{ text: "q2" }] },
      ],
    });
  });

  it.each([404, 500])(
    "maps HTTP %i to AiProviderErrorException",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );

      await expect(drain(new GeminiAiProvider(options))).rejects.toBeInstanceOf(
        AiProviderErrorException,
      );
    },
  );

  it("maps a network failure to AiUnavailableException", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(drain(new GeminiAiProvider(options))).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it("maps a safety block to AiProviderErrorException", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            'data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n',
          ]),
        ),
    );

    await expect(drain(new GeminiAiProvider(options))).rejects.toBeInstanceOf(
      AiProviderErrorException,
    );
  });

  it("rethrows the abort reason when the signal aborts while an error body is read", async () => {
    const controller = new AbortController();
    const slowBody = new ReadableStream<Uint8Array>({
      start(stream) {
        controller.signal.addEventListener("abort", () =>
          stream.error(new Error("cancelled")),
        );
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(slowBody, { status: 503 })),
    );
    const reason = new Error("timed out");
    const result = drain(
      new GeminiAiProvider(options),
      "hi",
      controller.signal,
    );

    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
  });

  it("never logs the API key or the prompt, even when the error body echoes the key", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("invalid key AIza-test-key", { status: 400 }),
        ),
    );

    await expect(
      drain(new GeminiAiProvider(options), "confidential-prompt-42"),
    ).rejects.toThrow();

    const logged = lines.join("\n");
    expect(logged).toMatch(
      /provider=gemini model=gemini-2.0-flash-lite durationMs=\d+ outcome=AiProviderErrorException/,
    );
    expect(logged).not.toContain("AIza-test-key");
    expect(logged).not.toContain("confidential-prompt-42");
    expect(logged).toContain("[redacted]");
  });
});
