import { z } from "zod";

import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";
import { parseLineStream, STREAM_DONE } from "./stream.utils";

const ChunkSchema = z.looseObject({
  error: z.unknown().optional(),
  message: z.looseObject({ content: z.string().nullish() }).nullish(),
  done: z.boolean().nullish(),
});

/**
 * Parses one NDJSON line of an Ollama `/api/chat` stream.
 * @param line A single line without its line terminator.
 * @returns The text delta, `null` when the line carries no text, or `STREAM_DONE`.
 * @throws AiProviderErrorException for an error payload.
 * @throws AiBadResponseException for invalid JSON or an unexpected shape.
 */
export function parseOllamaChunk(
  line: string,
): string | null | typeof STREAM_DONE {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (cause) {
    throw new AiBadResponseException(undefined, cause);
  }
  const parsed = ChunkSchema.safeParse(json);
  if (!parsed.success) {
    throw new AiBadResponseException(undefined, parsed.error);
  }

  const chunk = parsed.data;
  if (chunk.error !== undefined && chunk.error !== null) {
    throw new AiProviderErrorException(undefined, chunk.error);
  }
  const content = chunk.message?.content;
  if (content) return content;
  return chunk.done ? STREAM_DONE : null;
}

/**
 * Turns raw response bytes into text deltas.
 * @param body Response body bytes.
 * @throws AiBadResponseException when the stream ends without any content.
 */
export function parseOllamaStream(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  return parseLineStream(body, parseOllamaChunk);
}
