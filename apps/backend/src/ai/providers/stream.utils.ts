import {
  AiBadResponseException,
  OperationAbortedException,
} from "../../common/exceptions";

/** Returned by a line parser when the provider signals the end of the stream. */
export const STREAM_DONE = Symbol("STREAM_DONE");

/** Parses one line of a provider stream: a text delta, `null` for no text, or `STREAM_DONE`. */
export type LineParser = (line: string) => string | null | typeof STREAM_DONE;

/**
 * Turns raw response bytes into text deltas using a provider-specific line
 * parser. Handles lines (and multi-byte characters) split across network
 * chunks, stops at `STREAM_DONE`, and fails when no content was produced.
 * @param body Response body bytes.
 * @param parseLine Pure parser for one line.
 * @throws AiBadResponseException when the stream ends without any content.
 */
export async function* parseLineStream(
  body: AsyncIterable<Uint8Array>,
  parseLine: LineParser,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let yielded = false;

  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const result = parseLine(line);
      if (result === STREAM_DONE) {
        assertHadContent(yielded);
        return;
      }
      if (result) {
        yielded = true;
        yield result;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    const result = parseLine(buffer);
    if (result && result !== STREAM_DONE) {
      yielded = true;
      yield result;
    }
  }
  assertHadContent(yielded);
}

function assertHadContent(yielded: boolean): void {
  if (!yielded) {
    throw new AiBadResponseException();
  }
}

/**
 * The error iteration ends with after an abort: the abort reason when it is an
 * `Error`, otherwise an `AbortError`.
 * @param signal The aborted signal.
 */
export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new OperationAbortedException();
}
