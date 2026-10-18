import { Logger } from "@nestjs/common";

import type { AiChatMessage } from "../ai-provider.interface";
import { parseGeminiStream } from "./gemini-stream.parser";
import {
  HttpStreamingAiProvider,
  type StreamRequest,
} from "./http-streaming-ai.provider";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** Adapter for Google Gemini (`streamGenerateContent?alt=sse`, key in a header). */
export class GeminiAiProvider extends HttpStreamingAiProvider {
  public readonly name = "gemini" as const;
  protected readonly model: string;
  protected readonly logger = new Logger(GeminiAiProvider.name);

  constructor(private readonly options: GeminiOptions) {
    super();
    this.model = options.model;
  }

  /** @returns True when an API key is set. */
  public isConfigured(): boolean {
    return this.options.apiKey.trim().length > 0;
  }

  protected buildRequest(messages: AiChatMessage[]): StreamRequest {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    return {
      // The key goes in a header, never the URL, so it cannot leak through URLs or logs.
      url: `${this.options.baseUrl ?? GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(this.options.model)}:streamGenerateContent?alt=sse`,
      headers: { "x-goog-api-key": this.options.apiKey },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
      },
    };
  }

  protected parseStream(
    body: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<string> {
    return parseGeminiStream(body);
  }

  protected override secrets(): string[] {
    return [this.options.apiKey];
  }
}
