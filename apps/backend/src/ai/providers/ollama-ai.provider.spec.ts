import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiProviderErrorException,
  AiUnavailableException,
} from "../../common/exceptions";
import { OllamaAiProvider } from "./ollama-ai.provider";
import { captureLogs, drain, streamResponse } from "./provider-test.helpers";

const options = { baseUrl: "http://localhost:11434/", model: "gemma4:12b" };
const ndjson = (content: string, done = false): string =>
  `${JSON.stringify({ message: { content }, done })}\n`;

describe("OllamaAiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is configured when a base URL is set (no key needed)", () => {
    expect(new OllamaAiProvider(options).isConfigured()).toBe(true);
    expect(
      new OllamaAiProvider({ ...options, baseUrl: "" }).isConfigured(),
    ).toBe(false);
  });

  it("posts a streaming chat request to /api/chat and yields deltas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        streamResponse([ndjson("Hel"), ndjson("lo"), ndjson("", true)]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await drain(new OllamaAiProvider(options));

    expect(result).toEqual(["Hel", "lo"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "gemma4:12b",
      stream: true,
      think: false,
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it.each([404, 500])(
    "maps HTTP %i to AiProviderErrorException",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response('{"error":"nope"}', { status })),
      );

      await expect(drain(new OllamaAiProvider(options))).rejects.toBeInstanceOf(
        AiProviderErrorException,
      );
    },
  );

  it("maps a refused connection to AiUnavailableException", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(drain(new OllamaAiProvider(options))).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it("throws AiUnavailableException without calling fetch when no base URL is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      drain(new OllamaAiProvider({ ...options, baseUrl: "" })),
    ).rejects.toBeInstanceOf(AiUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows the abort reason when the signal aborts mid-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([ndjson("first")], { keepOpen: true }),
        ),
    );
    const controller = new AbortController();
    const reason = new Error("timed out");
    const received: string[] = [];

    const run = async (): Promise<void> => {
      for await (const delta of new OllamaAiProvider(options).streamChat(
        [{ role: "user", content: "hi" }],
        { signal: controller.signal },
      )) {
        received.push(delta);
        controller.abort(reason);
      }
    };

    await expect(run()).rejects.toBe(reason);
    expect(received).toEqual(["first"]);
  });

  it("logs provider, model, duration and outcome, never the prompt", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse([ndjson("ok")])),
    );

    await drain(new OllamaAiProvider(options), "confidential-prompt-42");

    expect(lines.join("\n")).toMatch(
      /provider=ollama model=gemma4:12b durationMs=\d+ outcome=ok/,
    );
    expect(lines.join("\n")).not.toContain("confidential-prompt-42");
  });
});
