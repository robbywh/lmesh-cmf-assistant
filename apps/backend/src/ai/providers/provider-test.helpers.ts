import { Readable } from "node:stream";

import { Logger } from "@nestjs/common";
import { vi } from "vitest";

const encoder = new TextEncoder();

/** Body bytes from text parts (each part is one network chunk). */
export function bytes(
  ...parts: (string | Uint8Array)[]
): AsyncIterable<Uint8Array> {
  return Readable.from(
    parts.map((part) =>
      typeof part === "string" ? encoder.encode(part) : part,
    ),
  );
}

export async function collect(
  source: AsyncIterable<string>,
): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of source) out.push(delta);
  return out;
}

/** A streaming `Response`; `keepOpen` leaves the stream hanging after the chunks. */
export function streamResponse(
  chunks: string[],
  options: { keepOpen?: boolean; status?: number } = {},
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      if (!options.keepOpen) controller.close();
    },
  });
  return new Response(body, { status: options.status ?? 200 });
}

/** Captures everything a provider logs at any level (restore with `vi.restoreAllMocks`). */
export function captureLogs(): string[] {
  const lines: string[] = [];
  const record = (message: unknown): void => {
    lines.push(String(message));
  };
  vi.spyOn(Logger.prototype, "log").mockImplementation(record);
  vi.spyOn(Logger.prototype, "warn").mockImplementation(record);
  vi.spyOn(Logger.prototype, "error").mockImplementation(record);
  return lines;
}

/** Drains `streamChat` with a fresh (or given) signal. */
export async function drain(
  provider: {
    streamChat: (
      messages: { role: "user"; content: string }[],
      options: { signal: AbortSignal },
    ) => AsyncIterable<string>;
  },
  content = "hello",
  signal = new AbortController().signal,
): Promise<string[]> {
  return collect(provider.streamChat([{ role: "user", content }], { signal }));
}
