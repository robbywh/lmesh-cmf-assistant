import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import { AiUnavailableException } from "../common/exceptions";
import type { EnvironmentVariables } from "../config/env.validation";
import { AiProviderName as AiProviderEnv } from "../config/env.validation";
import type { AiProvider } from "./ai-provider.interface";
import { OpenRouterAiProvider } from "./providers/openrouter-ai.provider";
import { FaultInjectingAiProvider } from "./providers/fault-injecting-ai.provider";
import { GeminiAiProvider } from "./providers/gemini-ai.provider";
import { OllamaAiProvider } from "./providers/ollama-ai.provider";

/** Builds the `AiProvider` selected by configuration. */
export class AiProviderFactory {
  private static readonly logger = new Logger(AiProviderFactory.name);

  /**
   * Builds the adapter selected by `AI_PROVIDER`.
   * @param config Validated application configuration.
   * @returns The configured `AiProvider`.
   * An adapter missing its settings (key or base URL) still boots; chat requests then
   * return 503 `AI_UNAVAILABLE` (FR-INFRA-04).
   */
  public static create(
    config: ConfigService<EnvironmentVariables, true>,
  ): AiProvider {
    const selected = config.get("AI_PROVIDER", { infer: true });
    let provider: AiProvider;

    switch (selected) {
      case AiProviderEnv.OpenRouter:
        provider = new OpenRouterAiProvider({
          apiKey: config.get("OPENROUTER_API_KEY", { infer: true }) ?? "",
          model:
            config.get("OPENROUTER_MODEL", { infer: true }) ??
            "nvidia/nemotron-3-ultra-550b-a55b:free",
          referer: config.get("BETTER_AUTH_URL", { infer: true }),
        });
        break;
      case AiProviderEnv.Ollama:
        provider = new OllamaAiProvider({
          baseUrl: config.get("OLLAMA_BASE_URL", { infer: true }) ?? "",
          model: config.get("OLLAMA_MODEL", { infer: true }) ?? "llama3.2",
        });
        break;
      case AiProviderEnv.Gemini:
        provider = new GeminiAiProvider({
          apiKey: config.get("GEMINI_API_KEY", { infer: true }) ?? "",
          model:
            config.get("GEMINI_MODEL", { infer: true }) ??
            "gemini-2.0-flash-lite",
        });
        break;
      default:
        throw new AiUnavailableException(
          `AI_PROVIDER "${String(selected)}" is not supported`,
        );
    }

    if (config.get("AI_FAULT_INJECTION", { infer: true }) === true) {
      AiProviderFactory.logger.warn(
        "AI_FAULT_INJECTION is ON: e2e fault markers are honoured. Never enable this outside tests.",
      );
      provider = new FaultInjectingAiProvider(provider);
    }

    if (!provider.isConfigured()) {
      AiProviderFactory.logger.warn(
        `AI provider "${provider.name}" is not configured; chat requests will fail with AI_UNAVAILABLE`,
      );
    }
    return provider;
  }
}
