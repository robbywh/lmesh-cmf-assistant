import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiProviderErrorException,
  AiUnavailableException,
} from "../../common/exceptions";
import { OpenRouterAiProvider } from "./openrouter-ai.provider";

const options = {
  apiKey: "sk-test-key",
  model: "test/model",
  referer: "http://localhost:5173",
};
const PROMPT = "confidential-prompt-text-42";
const messages = [{ role: "user" as const, content: PROMPT }];
const encoder = new TextEncoder();

const sse = (content: string): Uint8Array =>
  encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );

function streamResponse(chunks: Uint8Array[], keepOpen = false): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      if (!keepOpen) controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function drain(
  provider: OpenRouterAiProvider,
  signal = new AbortController().signal,
): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of provider.streamChat(messages, { signal })) {
    out.push(delta);
  }
  return out;
}

describe("OpenRouterAiProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is configured only with a non-empty key", () => {
    expect(new OpenRouterAiProvider(options).isConfigured()).toBe(true);
    expect(
      new OpenRouterAiProvider({ ...options, apiKey: "" }).isConfigured(),
    ).toBe(false);
  });

  it("throws AiUnavailableException without calling fetch when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterAiProvider({ ...options, apiKey: "" });

    await expect(drain(provider)).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a streaming request and yields deltas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamResponse([sse("Hel"), sse("lo")]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await drain(new OpenRouterAiProvider(options));

    expect(result).toEqual(["Hel", "lo"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test-key");
    expect(headers["HTTP-Referer"]).toBe("http://localhost:5173");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "test/model",
      stream: true,
      messages,
    });
  });

  it.each([429, 500])(
    "maps HTTP %i to AiProviderErrorException",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response("sk-test-key limit", { status })),
      );

      await expect(
        drain(new OpenRouterAiProvider(options)),
      ).rejects.toBeInstanceOf(AiProviderErrorException);
    },
  );

  it("rethrows the abort reason when the signal aborts while an error response is being read", async () => {
    const controller = new AbortController();
    const slowBody = new ReadableStream<Uint8Array>({
      start(stream) {
        controller.signal.addEventListener("abort", () =>
          stream.error(new Error("body cancelled")),
        );
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(slowBody, { status: 503 })),
    );
    const reason = new Error("timed out");
    const result = drain(new OpenRouterAiProvider(options), controller.signal);

    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
  });

  it("maps a connection error while reading the stream to AiUnavailableException", async () => {
    let step = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (step++ === 0) controller.enqueue(sse("first"));
        else controller.error(new Error("socket hang up"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );
    const received: string[] = [];

    const run = async (): Promise<void> => {
      for await (const delta of new OpenRouterAiProvider(options).streamChat(
        messages,
        { signal: new AbortController().signal },
      )) {
        received.push(delta);
      }
    };

    await expect(run()).rejects.toBeInstanceOf(AiUnavailableException);
    expect(received).toEqual(["first"]);
  });

  it("rethrows the very same custom abort reason when aborted mid-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse([sse("first")], true)),
    );
    const controller = new AbortController();
    const reason = new Error("custom timeout reason");

    const run = async (): Promise<void> => {
      for await (const _delta of new OpenRouterAiProvider(options).streamChat(
        messages,
        { signal: controller.signal },
      )) {
        controller.abort(reason);
      }
    };

    await expect(run()).rejects.toBe(reason);
  });

  it("maps a 200 response without a body to AiProviderErrorException", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    await expect(
      drain(new OpenRouterAiProvider(options)),
    ).rejects.toBeInstanceOf(AiProviderErrorException);
  });

  it("maps a network failure to AiUnavailableException", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(
      drain(new OpenRouterAiProvider(options)),
    ).rejects.toBeInstanceOf(AiUnavailableException);
  });

  it("stops iterating with AbortError when the signal aborts mid-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse([sse("first")], true)),
    );
    const controller = new AbortController();
    const received: string[] = [];

    const run = async (): Promise<void> => {
      for await (const delta of new OpenRouterAiProvider(options).streamChat(
        messages,
        { signal: controller.signal },
      )) {
        received.push(delta);
        controller.abort();
      }
    };

    await expect(run()).rejects.toMatchObject({ name: "AbortError" });
    expect(received).toEqual(["first"]);
  });

  it("rethrows AbortError when fetch is aborted before a response", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }),
    );

    await expect(
      drain(new OpenRouterAiProvider(options), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("OpenRouterAiProvider logging (FR-INFRA-10)", () => {
  const LINE =
    /provider=openrouter model=test\/model durationMs=\d+ outcome=(\S+)/;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function captureLogs(): string[] {
    const lines: string[] = [];
    const record = (message: unknown): void => {
      lines.push(String(message));
    };
    vi.spyOn(Logger.prototype, "log").mockImplementation(record);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(record);
    vi.spyOn(Logger.prototype, "error").mockImplementation(record);
    return lines;
  }

  it("logs provider, model, duration and outcome for a successful call", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse([sse("ok")])),
    );

    await drain(new OpenRouterAiProvider(options));

    expect(lines.map((l) => LINE.exec(l)?.[1])).toContain("ok");
  });

  it("logs the outcome for a provider error, without the API key or prompt", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(`bad key sk-test-key for ${PROMPT}`, { status: 429 }),
        ),
    );

    await expect(drain(new OpenRouterAiProvider(options))).rejects.toThrow();

    expect(lines.map((l) => LINE.exec(l)?.[1])).toContain(
      "AiProviderErrorException",
    );
    expect(lines.join("\n")).not.toContain("sk-test-key");
    expect(lines.join("\n")).toContain("[redacted]");
  });

  it("logs outcome=aborted when the signal aborts, without the API key or prompt", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse([sse("first")], true)),
    );
    const controller = new AbortController();

    const run = async (): Promise<void> => {
      for await (const _delta of new OpenRouterAiProvider(options).streamChat(
        messages,
        { signal: controller.signal },
      )) {
        controller.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ name: "AbortError" });

    expect(lines.map((l) => LINE.exec(l)?.[1])).toContain("aborted");
  });

  it("never logs the API key or prompt text on any path", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError(`fetch failed ${PROMPT}`)),
    );

    await expect(drain(new OpenRouterAiProvider(options))).rejects.toThrow();

    const logged = lines.join("\n");
    expect(logged).not.toContain("sk-test-key");
    expect(logged).not.toContain(PROMPT);
  });
});
