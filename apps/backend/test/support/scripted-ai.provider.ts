import type {
  AiChatMessage,
  AiProvider,
  AiStreamOptions,
} from "../../src/ai/ai-provider.interface";

export type ScriptStep =
  | { delta: string }
  | { error: Error }
  /** Waits until the signal aborts, then rejects with the abort reason. */
  | { hang: true }
  | { delayMs: number };

/**
 * Test double for the `AI_PROVIDER` token: plays a script of deltas, errors,
 * delays and hangs, and records what it was called with. Honours the signal.
 */
export class ScriptedAiProvider implements AiProvider {
  public readonly name = "openrouter" as const;
  public lastMessages: AiChatMessage[] = [];
  public lastSignal: AbortSignal | undefined;
  public calls = 0;

  constructor(
    public script: ScriptStep[] = [],
    private configured = true,
  ) {}

  public setConfigured(value: boolean): void {
    this.configured = value;
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  public async *streamChat(
    messages: AiChatMessage[],
    { signal }: AiStreamOptions,
  ): AsyncGenerator<string> {
    this.calls += 1;
    this.lastMessages = messages;
    this.lastSignal = signal;
    for (const step of this.script) {
      if ("delta" in step) {
        yield step.delta;
      } else if ("error" in step) {
        throw step.error;
      } else if ("delayMs" in step) {
        await new Promise((resolve) => setTimeout(resolve, step.delayMs));
      } else {
        await new Promise<never>((_, reject) => {
          const fail = (): void =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error("aborted"),
            );
          if (signal.aborted) fail();
          else signal.addEventListener("abort", fail, { once: true });
        });
      }
    }
  }
}
