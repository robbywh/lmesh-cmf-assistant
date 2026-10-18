import { type SseEvent, SseEventSchema } from "@lmesh/api-contract";

/** The slice of Node's `ServerResponse` the writer needs (easy to fake in tests). */
export interface SseSink {
  write(chunk: string): boolean;
  end(): void;
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
}

export interface SseWriterOptions {
  /** Validate every event against the contract schema (on in dev and test). */
  validate?: boolean;
}

/** Writes SSE frames (`event: <type>\ndata: <json>\n\n`) and comments to a response. */
export class SseWriter {
  private ended = false;

  constructor(
    private readonly sink: SseSink,
    private readonly options: SseWriterOptions = {},
  ) {}

  /** True once the response ended or the connection is gone; writes are then ignored. */
  public get closed(): boolean {
    return this.ended || this.sink.writableEnded || this.sink.destroyed;
  }

  /**
   * Writes one contract event. Ignored when the connection is closed.
   * @param event A contract `SseEvent`.
   */
  public event(event: SseEvent): void {
    if (this.closed) return;
    if (this.options.validate) SseEventSchema.parse(event);
    this.sink.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Writes a comment frame such as the `ping` heartbeat.
   * @param text Comment text (no newlines).
   */
  public comment(text: string): void {
    if (this.closed) return;
    this.sink.write(`: ${text}\n\n`);
  }

  /** Ends the response; safe to call more than once. */
  public close(): void {
    if (this.closed) return;
    this.ended = true;
    this.sink.end();
  }
}
