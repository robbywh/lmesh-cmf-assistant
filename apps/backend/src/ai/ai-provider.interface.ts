import type { AiProviderName as AiProviderEnv } from "../config/env.validation";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Derived from the env enum so the two can never drift apart. */
export type AiProviderName = `${AiProviderEnv}`;

export interface AiStreamOptions {
  /** Aborting cancels the request; iteration then throws the abort reason or an `AbortError`. */
  signal: AbortSignal;
  /** Id of the assistant message being generated (a retry reuses it); used by test doubles. */
  messageId?: string;
}

/** Port implemented by every LLM adapter; chat code depends only on this. */
export interface AiProvider {
  readonly name: AiProviderName;
  /** True when the adapter has what it needs (e.g. an API key). */
  isConfigured(): boolean;
  /**
   * Streams text deltas (non-empty strings).
   * Throws `Ai*Exception`s on provider failure and the abort reason on abort.
   */
  streamChat(
    messages: AiChatMessage[],
    options: AiStreamOptions,
  ): AsyncIterable<string>;
}
