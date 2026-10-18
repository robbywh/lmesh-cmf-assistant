/** A raw server-sent event record before payload validation. */
export interface SseRecord {
  /** Event name; `"message"` when the record has no `event:` line. */
  event: string;
  /** `data:` lines joined with `"\n"`. */
  data: string;
}

const LINE_BREAK = /\r\n|\n|\r/;

/**
 * Reads `text/event-stream` records from a byte stream. Handles events split
 * across chunks, several events per chunk, CRLF/LF line endings and multi-line
 * data. Comment lines (e.g. `: ping`) are ignored, as is a trailing partial
 * event when the stream ends.
 */
export async function* readSseRecords(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseRecord> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let dataLines: string[] = [];

  function* consume(line: string): Generator<SseRecord> {
    if (line === "") {
      if (dataLines.length > 0) {
        yield { event: event || "message", data: dataLines.join("\n") };
      }
      event = "";
      dataLines = [];
      return;
    }
    if (line.startsWith(":")) return;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        // A held "\r" at the end of the stream is a real line terminator ("data: 1\r\r").
        if (buffer.endsWith("\r")) {
          for (const line of buffer.slice(0, -1).split(LINE_BREAK)) yield* consume(line);
        }
        return; // Any other trailing partial event is dropped.
      }
      buffer += decoder.decode(value, { stream: true });

      // A trailing "\r" may be the first half of "\r\n": hold it back.
      const held = buffer.endsWith("\r") ? "\r" : "";
      const lines = (held ? buffer.slice(0, -1) : buffer).split(LINE_BREAK);
      buffer = (lines.pop() ?? "") + held;

      for (const line of lines) yield* consume(line);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
