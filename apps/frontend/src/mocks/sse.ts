import {
  ErrorCode,
  SseEventType,
  type Message,
  type SseEvent,
} from "@lmesh/api-contract";

/** Heartbeat comment line the server sends while waiting for the provider. */
export const SSE_PING = ": ping\n\n";

/** How a mocked stream behaves. `pre-stream-error` answers with a JSON error before any byte. */
export type StreamScenario =
  | {
      kind: "success";
      tokens?: string[];
      tokenDelayMs?: number;
      /** Emit a `: ping` comment before the first token. */
      ping?: boolean;
    }
  | {
      kind: "error-midstream";
      code?: ErrorCode;
      message?: string;
      tokens?: string[];
      tokenDelayMs?: number;
      ping?: boolean;
    }
  | {
      kind: "pre-stream-error";
      status: number;
      code: ErrorCode;
      message?: string;
    };

export type StreamingScenario = Exclude<StreamScenario, { kind: "pre-stream-error" }>;

export const DEFAULT_CHAT_TOKENS = [
  "Warm ",
  "earth ",
  "tones ",
  "work ",
  "best ",
  "with ",
  "matte, ",
  "natural ",
  "materials.",
];

export const DEFAULT_SUMMARY_TOKENS = [
  "Summary: ",
  "matte ",
  "cognac ",
  "leather ",
  "with ",
  "satin ",
  "walnut ",
  "trim.",
];

/** Fault markers mirroring the backend's `[[e2e-fault:*]]` convention (FSD 13.2.4). */
export function scenarioFromMarker(content: string): StreamScenario | null {
  const match = /\[\[e2e-fault:([a-z-]+)\]\]/.exec(content);
  switch (match?.[1]) {
    case "timeout":
      return { kind: "error-midstream", code: ErrorCode.AI_TIMEOUT, tokens: [] };
    case "error-midstream":
      return { kind: "error-midstream", tokens: DEFAULT_CHAT_TOKENS.slice(0, 3) };
    case "malformed":
      return { kind: "error-midstream", code: ErrorCode.AI_BAD_RESPONSE, tokens: [] };
    case "slow":
      return { kind: "success", tokenDelayMs: 1000 };
    default:
      return null;
  }
}

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.AI_TIMEOUT]: "The AI took too long to respond.",
  [ErrorCode.AI_BAD_RESPONSE]: "The AI returned an unreadable response.",
};

/** Encodes one event as `event: <type>\ndata: <json>\n\n`. */
export function encodeSseEvent(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export interface ScenarioContext {
  /** Saved user message (send) or `null` (summarise, retry). */
  userMessage: Message | null;
  /** Placeholder with `status: streaming` and empty content. */
  assistantMessage: Message;
  /** Used when the scenario sets no `tokenDelayMs`. */
  tokenDelayMs: number;
  defaultTokens: string[];
}

/**
 * Yields the contract events of a streaming scenario in order
 * (`message.created`, `token`*, then `done` or `error`), or {@link SSE_PING}
 * for heartbeats.
 */
export async function* scenarioEvents(
  scenario: StreamingScenario,
  context: ScenarioContext,
): AsyncGenerator<SseEvent | typeof SSE_PING> {
  const { userMessage, assistantMessage } = context;
  const tokens = scenario.tokens ?? context.defaultTokens;
  const delayMs = scenario.tokenDelayMs ?? context.tokenDelayMs;

  yield { type: SseEventType.MESSAGE_CREATED, userMessage, assistantMessage };
  if (scenario.ping) yield SSE_PING;

  let content = "";
  for (const delta of tokens) {
    await sleep(delayMs);
    content += delta;
    yield { type: SseEventType.TOKEN, messageId: assistantMessage.id, delta };
  }
  await sleep(delayMs);

  const updatedAt = new Date().toISOString();
  if (scenario.kind === "error-midstream") {
    const code = scenario.code ?? ErrorCode.AI_PROVIDER_ERROR;
    yield {
      type: SseEventType.ERROR,
      messageId: assistantMessage.id,
      code,
      message: scenario.message ?? ERROR_MESSAGES[code] ?? "The AI provider failed.",
    };
    return;
  }
  yield {
    type: SseEventType.DONE,
    message: { ...assistantMessage, content, status: "complete", updatedAt },
  };
}

export interface SseResponseOptions {
  /** Called when the client aborts (connection closed before the source ended). */
  onCancel?: () => void;
}

/**
 * Wraps events (and optional ping comments) in a `text/event-stream` response.
 * Cancelling the reader stops the source and calls `onCancel`.
 */
export function createSseResponse(
  source: AsyncIterator<SseEvent | typeof SSE_PING>,
  { onCancel }: SseResponseOptions = {},
): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  const cancelOnce = () => {
    if (cancelled) return;
    cancelled = true;
    onCancel?.();
    void source.return?.();
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await source.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value === SSE_PING ? value : encodeSseEvent(value)));
    },
    cancel: cancelOnce,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
