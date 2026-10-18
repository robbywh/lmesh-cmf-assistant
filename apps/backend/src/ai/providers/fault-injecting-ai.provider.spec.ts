import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiBadResponseException,
  AiProviderErrorException,
  AiTimeoutException,
} from "../../common/exceptions";
import type {
  AiChatMessage,
  AiProvider,
  AiStreamOptions,
} from "../ai-provider.interface";
import {
  detectFault,
  FaultInjectingAiProvider,
  stripFaultMarkers,
} from "./fault-injecting-ai.provider";

function fakeInner(configured = true) {
  const calls: AiChatMessage[][] = [];
  const inner: AiProvider = {
    name: "ollama",
    isConfigured: () => configured,
    // eslint-disable-next-line @typescript-eslint/require-await
    async *streamChat(messages: AiChatMessage[]) {
      calls.push(messages);
      yield "real ";
      yield "answer";
    },
  };
  return { inner, calls };
}

const ask = (content: string): AiChatMessage[] => [
  { role: "system", content: "system" },
  { role: "user", content },
];

async function run(
  provider: AiProvider,
  messages: AiChatMessage[],
  options: Partial<AiStreamOptions> = {},
): Promise<{ deltas: string[]; error?: unknown }> {
  const deltas: string[] = [];
  try {
    for await (const delta of provider.streamChat(messages, {
      signal: new AbortController().signal,
      ...options,
    })) {
      deltas.push(delta);
    }
    return { deltas };
  } catch (error) {
    return { deltas, error };
  }
}

describe("FaultInjectingAiProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delegates to the wrapped provider with unchanged messages when there is no marker", async () => {
    const { inner, calls } = fakeInner();
    const messages = ask("Which leather?");

    const result = await run(new FaultInjectingAiProvider(inner), messages);

    expect(result.deltas).toEqual(["real ", "answer"]);
    expect(calls).toEqual([messages]);
  });

  it("[[e2e-fault:timeout]] waits about 2 s, then throws AiTimeoutException without calling the real provider", async () => {
    const { inner, calls } = fakeInner();
    const running = run(
      new FaultInjectingAiProvider(inner),
      ask("hi [[e2e-fault:timeout]]"),
    );

    await vi.advanceTimersByTimeAsync(1_900);
    let settled = false;
    void running.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    const result = await running;

    expect(result.error).toBeInstanceOf(AiTimeoutException);
    expect(calls).toHaveLength(0);
  });

  it("[[e2e-fault:error-midstream]] yields 3 short deltas, then throws AiProviderErrorException", async () => {
    const { inner, calls } = fakeInner();
    const running = run(
      new FaultInjectingAiProvider(inner),
      ask("[[e2e-fault:error-midstream]]"),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await running;

    expect(result.deltas).toHaveLength(3);
    expect(result.error).toBeInstanceOf(AiProviderErrorException);
    expect(calls).toHaveLength(0);
  });

  it("[[e2e-fault:malformed]] throws AiBadResponseException immediately", async () => {
    const { inner } = fakeInner();

    const result = await run(
      new FaultInjectingAiProvider(inner),
      ask("[[e2e-fault:malformed]]"),
    );

    expect(result.deltas).toEqual([]);
    expect(result.error).toBeInstanceOf(AiBadResponseException);
  });

  it("[[e2e-fault:slow]] yields about 20 deltas over about 10 s and finishes normally", async () => {
    const { inner, calls } = fakeInner();
    const running = run(
      new FaultInjectingAiProvider(inner),
      ask("[[e2e-fault:slow]]"),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await running;

    expect(result.deltas).toHaveLength(20);
    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("stops [[e2e-fault:slow]] promptly with the abort reason when the signal aborts", async () => {
    const { inner } = fakeInner();
    const controller = new AbortController();
    const reason = new Error("client left");
    const running = run(
      new FaultInjectingAiProvider(inner),
      ask("[[e2e-fault:slow]]"),
      { signal: controller.signal },
    );

    await vi.advanceTimersByTimeAsync(1_200);
    controller.abort(reason);
    const result = await running;

    expect(result.error).toBe(reason);
    expect(result.deltas.length).toBeLessThan(5);
  });

  it("only looks at the newest user message", async () => {
    const { inner, calls } = fakeInner();
    const messages: AiChatMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "old [[e2e-fault:malformed]]" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "new question" },
    ];

    const result = await run(new FaultInjectingAiProvider(inner), messages);

    expect(result.error).toBeUndefined();
    expect(calls[0]?.[1]?.content).toBe("old");
  });

  it("faults once per message id: a retry of the same message reaches the real provider with the marker stripped", async () => {
    const { inner, calls } = fakeInner();
    const provider = new FaultInjectingAiProvider(inner);
    const messages = ask("Please answer [[e2e-fault:malformed]]");
    const options = { messageId: "assistant-1" };

    const first = await run(provider, messages, options);
    const retry = await run(provider, messages, options);
    const otherMessage = await run(provider, messages, {
      messageId: "assistant-2",
    });

    expect(first.error).toBeInstanceOf(AiBadResponseException);
    expect(retry.deltas).toEqual(["real ", "answer"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.at(-1)?.content).toBe("Please answer");
    expect(otherMessage.error).toBeInstanceOf(AiBadResponseException);
  });

  it("delegates name and isConfigured to the wrapped provider, and still simulates faults when it is not configured", async () => {
    const { inner } = fakeInner(false);
    const provider = new FaultInjectingAiProvider(inner);

    expect(provider.name).toBe("ollama");
    expect(provider.isConfigured()).toBe(false);
    const result = await run(provider, ask("[[e2e-fault:malformed]]"));
    expect(result.error).toBeInstanceOf(AiBadResponseException);
  });
});

describe("fault marker helpers", () => {
  it("detects the marker in the newest user message only", () => {
    expect(detectFault(ask("x [[e2e-fault:slow]]"))).toBe("slow");
    expect(detectFault(ask("no marker"))).toBeNull();
    expect(detectFault(ask("[[e2e-fault:unknown]]"))).toBeNull();
  });

  it("strips every marker from every message without touching other text", () => {
    const stripped = stripFaultMarkers([
      { role: "user", content: "a [[e2e-fault:slow]] b [[e2e-fault:timeout]]" },
      { role: "assistant", content: "plain" },
    ]);

    expect(stripped.map((message) => message.content)).toEqual([
      "a  b",
      "plain",
    ]);
  });
});
