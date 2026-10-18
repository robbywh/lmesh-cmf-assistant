import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentVariables } from "../config/env.validation";
import { AiProviderFactory } from "./ai-provider.factory";
import { FaultInjectingAiProvider } from "./providers/fault-injecting-ai.provider";
import { GeminiAiProvider } from "./providers/gemini-ai.provider";
import { OllamaAiProvider } from "./providers/ollama-ai.provider";
import { OpenRouterAiProvider } from "./providers/openrouter-ai.provider";

function configOf(
  values: Partial<Record<keyof EnvironmentVariables, unknown>>,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key as keyof EnvironmentVariables],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe("AiProviderFactory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function requestedUrlAndBody(
    provider: ReturnType<typeof AiProviderFactory.create>,
  ): Promise<{ url: string; body: { model?: string } }> {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("stop here"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      for await (const _delta of provider.streamChat(
        [{ role: "user", content: "hi" }],
        { signal: new AbortController().signal },
      )) {
        // the stubbed fetch fails before any delta
      }
    } catch {
      // expected: only the request that was built matters here
    }
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, body: JSON.parse(init.body as string) as { model?: string } };
  }

  it("logs a startup warning when the selected provider is not configured, and none when it is", () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const base = { BETTER_AUTH_URL: "http://localhost:5173" };

    AiProviderFactory.create(
      configOf({ ...base, AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "" }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"openrouter" is not configured'),
    );

    warn.mockClear();
    AiProviderFactory.create(
      configOf({
        ...base,
        AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "key",
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to each provider's default model when none is configured", async () => {
    const base = { BETTER_AUTH_URL: "http://localhost:5173" };

    const openrouter = await requestedUrlAndBody(
      AiProviderFactory.create(
        configOf({
          ...base,
          AI_PROVIDER: "openrouter",
          OPENROUTER_API_KEY: "k",
        }),
      ),
    );
    const ollama = await requestedUrlAndBody(
      AiProviderFactory.create(
        configOf({
          AI_PROVIDER: "ollama",
          OLLAMA_BASE_URL: "http://localhost:11434",
        }),
      ),
    );
    const gemini = await requestedUrlAndBody(
      AiProviderFactory.create(
        configOf({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" }),
      ),
    );

    expect(openrouter.body.model).toBe(
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    );
    expect(ollama.body.model).toBe("llama3.2");
    expect(gemini.url).toContain("/models/gemini-2.0-flash-lite:");
  });

  it("selects the OpenRouter adapter for AI_PROVIDER=openrouter", () => {
    const provider = AiProviderFactory.create(
      configOf({
        AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "key",
        OPENROUTER_MODEL: "m",
        BETTER_AUTH_URL: "http://localhost:5173",
      }),
    );

    expect(provider).toBeInstanceOf(OpenRouterAiProvider);
    expect(provider.name).toBe("openrouter");
    expect(provider.isConfigured()).toBe(true);
  });

  it("still boots when the key is missing, reporting not configured", () => {
    const provider = AiProviderFactory.create(
      configOf({
        AI_PROVIDER: "openrouter",
        BETTER_AUTH_URL: "http://localhost:5173",
      }),
    );

    expect(provider.isConfigured()).toBe(false);
  });

  it("selects the Ollama adapter, configured by OLLAMA_BASE_URL", () => {
    const configured = AiProviderFactory.create(
      configOf({
        AI_PROVIDER: "ollama",
        OLLAMA_BASE_URL: "http://localhost:11434",
        OLLAMA_MODEL: "gemma4:12b",
      }),
    );
    const missing = AiProviderFactory.create(
      configOf({ AI_PROVIDER: "ollama" }),
    );

    expect(configured).toBeInstanceOf(OllamaAiProvider);
    expect(configured.name).toBe("ollama");
    expect(configured.isConfigured()).toBe(true);
    expect(missing.isConfigured()).toBe(false);
  });

  it("selects the Gemini adapter, configured by GEMINI_API_KEY", () => {
    const configured = AiProviderFactory.create(
      configOf({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "key" }),
    );
    const missing = AiProviderFactory.create(
      configOf({ AI_PROVIDER: "gemini" }),
    );
    const empty = AiProviderFactory.create(
      configOf({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "" }),
    );

    expect(configured).toBeInstanceOf(GeminiAiProvider);
    expect(configured.name).toBe("gemini");
    expect(configured.isConfigured()).toBe(true);
    expect(missing.isConfigured()).toBe(false);
    expect(empty.isConfigured()).toBe(false);
  });

  describe("AI_FAULT_INJECTION", () => {
    const base = {
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "key",
      BETTER_AUTH_URL: "http://localhost:5173",
    };

    it("wraps the selected adapter in the fault-injecting decorator when true", () => {
      const provider = AiProviderFactory.create(
        configOf({ ...base, AI_FAULT_INJECTION: true }),
      );

      expect(provider).toBeInstanceOf(FaultInjectingAiProvider);
      expect(provider.name).toBe("openrouter");
      expect(provider.isConfigured()).toBe(true);
    });

    it.each([false, undefined])(
      "never wraps when AI_FAULT_INJECTION is %s, even though markers may be sent",
      (flag) => {
        const provider = AiProviderFactory.create(
          configOf({ ...base, AI_FAULT_INJECTION: flag }),
        );

        expect(provider).toBeInstanceOf(OpenRouterAiProvider);
        expect(provider).not.toBeInstanceOf(FaultInjectingAiProvider);
      },
    );
  });
});
