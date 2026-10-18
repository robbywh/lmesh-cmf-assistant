import { Logger } from "@nestjs/common";

import {
  AiProviderErrorException,
  AiUnavailableException,
} from "../../common/exceptions";
import type {
  AiChatMessage,
  AiProvider,
  AiProviderName,
  AiStreamOptions,
} from "../ai-provider.interface";
import { abortError } from "./stream.utils";

const MAX_LOGGED_BODY_CHARS = 500;

export interface StreamRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Template for adapters that stream a chat completion over plain `fetch`.
 * It owns everything provider-independent: the HTTP call, failure mapping
 * (FSD 10.2), abort handling and logging. Subclasses (the Adapter pattern)
 * only describe their request and parse their stream format.
 */
export abstract class HttpStreamingAiProvider implements AiProvider {
  public abstract readonly name: AiProviderName;
  protected abstract readonly model: string;
  /** Each adapter supplies its own `new Logger(ClassName.name)` so log context stays per adapter. */
  protected abstract readonly logger: Logger;

  public abstract isConfigured(): boolean;
  protected abstract buildRequest(messages: AiChatMessage[]): StreamRequest;
  protected abstract parseStream(
    body: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<string>;
  /** Secret values to scrub from anything logged. */
  protected secrets(): string[] {
    return [];
  }

  /**
   * Streams the model's reply as text deltas.
   * @param messages Prompt messages, system first.
   * @param options Abort signal; abort ends iteration by throwing the abort reason.
   * @throws AiUnavailableException when unconfigured or unreachable.
   * @throws AiProviderErrorException on HTTP errors or an error in the stream.
   * @throws AiBadResponseException on malformed or empty responses.
   */
  public async *streamChat(
    messages: AiChatMessage[],
    { signal }: AiStreamOptions,
  ): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new AiUnavailableException("The AI service is not configured");
    }
    const startedAt = Date.now();
    let outcome = "ok";
    try {
      const response = await this.request(messages, signal);
      yield* this.parseStream(this.readBody(response, signal));
    } catch (error) {
      outcome = signal.aborted
        ? "aborted"
        : error instanceof Error
          ? error.constructor.name
          : "unknown";
      throw error;
    } finally {
      this.logger.log(
        `provider=${this.name} model=${this.model} durationMs=${Date.now() - startedAt} outcome=${outcome}`,
      );
    }
  }

  private async request(
    messages: AiChatMessage[],
    signal: AbortSignal,
  ): Promise<Response> {
    const { url, headers, body } = this.buildRequest(messages);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (signal.aborted) throw abortError(signal);
      throw new AiUnavailableException(undefined, error);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // A timeout/abort during a slow error response is an abort, not a provider error.
      if (signal.aborted) throw abortError(signal);
      this.logger.warn(
        `${this.name} HTTP ${response.status}: ${this.redact(text).slice(0, MAX_LOGGED_BODY_CHARS)}`,
      );
      throw new AiProviderErrorException(undefined, response.status);
    }
    if (!response.body) {
      throw new AiProviderErrorException(undefined, "empty response body");
    }
    return response;
  }

  private async *readBody(
    response: Response,
    signal: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    const reader: ReadableStreamDefaultReader<Uint8Array> =
      response.body!.getReader();
    const cancel = (): void => void reader.cancel().catch(() => undefined);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw abortError(signal);
        if (done) return;
        yield value;
      }
    } catch (error) {
      if (signal.aborted) throw abortError(signal);
      if (error instanceof AiUnavailableException) throw error;
      throw new AiUnavailableException(undefined, error);
    } finally {
      signal.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => undefined);
    }
  }

  private redact(text: string): string {
    return this.secrets()
      .filter(Boolean)
      .reduce(
        (scrubbed, secret) => scrubbed.split(secret).join("[redacted]"),
        text,
      );
  }
}
