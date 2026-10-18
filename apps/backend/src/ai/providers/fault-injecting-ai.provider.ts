import { Logger } from "@nestjs/common";

import {
  AiBadResponseException,
  AiProviderErrorException,
  AiTimeoutException,
} from "../../common/exceptions";
import type {
  AiChatMessage,
  AiProvider,
  AiProviderName,
  AiStreamOptions,
} from "../ai-provider.interface";
import { abortError } from "./stream.utils";

export type FaultKind = "timeout" | "error-midstream" | "malformed" | "slow";

const MARKER = /\[\[e2e-fault:(timeout|error-midstream|malformed|slow)\]\]/;
const ANY_MARKER = /\[\[e2e-fault:[a-z-]+\]\]/g;

const TIMEOUT_DELAY_MS = 2_000;
const MIDSTREAM_DELTAS = ["Here are ", "a few ", "options "];
const MIDSTREAM_DELAY_MS = 100;
const SLOW_DELTAS = 20;
const SLOW_DELAY_MS = 500;

/**
 * Finds the fault marker in a prompt's newest user message.
 * @param messages Prompt messages.
 * @returns The requested fault, or null.
 */
export function detectFault(messages: AiChatMessage[]): FaultKind | null {
  const newestUser = messages.findLast((message) => message.role === "user");
  const match = newestUser ? MARKER.exec(newestUser.content) : null;
  return (match?.[1] as FaultKind | undefined) ?? null;
}

/** Removes every fault marker so none ever reaches a real provider. */
export function stripFaultMarkers(messages: AiChatMessage[]): AiChatMessage[] {
  return messages.map((message) =>
    message.content.includes("[[e2e-fault:")
      ? { ...message, content: message.content.replace(ANY_MARKER, "").trim() }
      : message,
  );
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Decorator around the real `AiProvider` for end-to-end tests only (enabled by
 * `AI_FAULT_INJECTION=true`, which only `docker-compose.e2e.yml` sets).
 * A fault marker in the newest user message triggers a synthetic failure once per
 * assistant message id; a retry of the same message, and every message without a
 * marker, goes to the real provider with all markers stripped. Real answers are
 * never mocked.
 */
export class FaultInjectingAiProvider implements AiProvider {
  private readonly logger = new Logger(FaultInjectingAiProvider.name);
  private readonly faulted = new Set<string>();

  constructor(private readonly inner: AiProvider) {}

  public get name(): AiProviderName {
    return this.inner.name;
  }

  /** @returns Whether the wrapped provider is configured. */
  public isConfigured(): boolean {
    return this.inner.isConfigured();
  }

  /**
   * Plays the requested fault the first time a message id asks for it; otherwise
   * delegates to the wrapped provider with fault markers removed.
   */
  public async *streamChat(
    messages: AiChatMessage[],
    options: AiStreamOptions,
  ): AsyncGenerator<string> {
    const fault = detectFault(messages);
    const alreadyFaulted =
      options.messageId !== undefined && this.faulted.has(options.messageId);

    if (fault && !alreadyFaulted) {
      if (options.messageId) this.faulted.add(options.messageId);
      this.logger.warn(`Injecting fault "${fault}"`);
      yield* this.simulate(fault, options.signal);
      return;
    }
    yield* this.inner.streamChat(stripFaultMarkers(messages), options);
  }

  private async *simulate(
    fault: FaultKind,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    switch (fault) {
      case "timeout":
        await delay(TIMEOUT_DELAY_MS, signal);
        throw new AiTimeoutException();
      case "malformed":
        throw new AiBadResponseException();
      case "error-midstream":
        for (const delta of MIDSTREAM_DELTAS) {
          await delay(MIDSTREAM_DELAY_MS, signal);
          yield delta;
        }
        throw new AiProviderErrorException(undefined, "injected fault");
      case "slow":
        for (let index = 1; index <= SLOW_DELTAS; index++) {
          await delay(SLOW_DELAY_MS, signal);
          yield `word${index} `;
        }
        return;
    }
  }
}
