import { Logger } from "@nestjs/common";

import type { AiChatMessage } from "../ai-provider.interface";
import {
  HttpStreamingAiProvider,
  type StreamRequest,
} from "./http-streaming-ai.provider";
import { parseOllamaStream } from "./ollama-stream.parser";

export interface OllamaOptions {
  /** e.g. `http://localhost:11434`; empty means not configured. */
  baseUrl: string;
  model: string;
}

/** Adapter for a local or self-hosted Ollama (`POST /api/chat`, NDJSON stream). */
export class OllamaAiProvider extends HttpStreamingAiProvider {
  public readonly name = "ollama" as const;
  protected readonly model: string;
  protected readonly logger = new Logger(OllamaAiProvider.name);

  constructor(private readonly options: OllamaOptions) {
    super();
    this.model = options.model;
  }

  /** @returns True when a base URL is set (Ollama needs no key). */
  public isConfigured(): boolean {
    return this.options.baseUrl.trim().length > 0;
  }

  protected buildRequest(messages: AiChatMessage[]): StreamRequest {
    return {
      url: `${this.options.baseUrl.trim().replace(/\/+$/, "")}/api/chat`,
      headers: {},
      // Reasoning models (e.g. gemma4) otherwise "think" silently for 30+ s before the first token.
      body: {
        model: this.options.model,
        messages,
        stream: true,
        think: false,
      },
    };
  }

  protected parseStream(
    body: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<string> {
    return parseOllamaStream(body);
  }
}
