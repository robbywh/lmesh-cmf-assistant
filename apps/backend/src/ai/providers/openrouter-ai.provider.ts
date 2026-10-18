import { Logger } from "@nestjs/common";

import type { AiChatMessage } from "../ai-provider.interface";
import {
  HttpStreamingAiProvider,
  type StreamRequest,
} from "./http-streaming-ai.provider";
import { parseOpenRouterStream } from "./openrouter-stream.parser";

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const APP_TITLE = "AI Design Brief Assistant";

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  /** Sent as `HTTP-Referer` (OpenRouter app attribution). */
  referer: string;
  url?: string;
}

/** Adapter for OpenRouter's OpenAI-compatible streaming chat completions. */
export class OpenRouterAiProvider extends HttpStreamingAiProvider {
  public readonly name = "openrouter" as const;
  protected readonly model: string;
  protected readonly logger = new Logger(OpenRouterAiProvider.name);

  constructor(private readonly options: OpenRouterOptions) {
    super();
    this.model = options.model;
  }

  /** @returns True when an API key is set. */
  public isConfigured(): boolean {
    return this.options.apiKey.trim().length > 0;
  }

  protected buildRequest(messages: AiChatMessage[]): StreamRequest {
    return {
      url: this.options.url ?? OPENROUTER_CHAT_URL,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "HTTP-Referer": this.options.referer,
        "X-Title": APP_TITLE,
      },
      body: { model: this.options.model, messages, stream: true },
    };
  }

  protected parseStream(
    body: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<string> {
    return parseOpenRouterStream(body);
  }

  protected override secrets(): string[] {
    return [this.options.apiKey];
  }
}
