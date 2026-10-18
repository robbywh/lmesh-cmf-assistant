import { z } from "zod";

import { parseLineStream, STREAM_DONE } from "./stream.utils";
import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";

export { STREAM_DONE };

const ChunkSchema = z.looseObject({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.looseObject({
        delta: z.looseObject({ content: z.string().nullish() }).nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
});

/**
 * Parses one line of an OpenRouter SSE body.
 * @param line A single line without its line terminator.
 * @returns The text delta, `null` when the line carries no text (blank line,
 * keep-alive comment, role-only or finish chunk), or `STREAM_DONE`.
 * @throws AiProviderErrorException for an error object in the stream.
 * @throws AiBadResponseException for invalid JSON or an unexpected shape.
 */
export function parseOpenRouterChunk(
  line: string,
): string | null | typeof STREAM_DONE {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    // Blank separators, ": OPENROUTER PROCESSING" comments, other SSE fields.
    return null;
  }
  const payload = trimmed.slice("data:".length).trim();
  if (payload === "[DONE]") return STREAM_DONE;
  if (payload === "") return null;

  let json: unknown;
  try {
    json = JSON.parse(payload);
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
  const choice = chunk.choices?.[0];
  if (choice?.finish_reason === "error") {
    throw new AiProviderErrorException(undefined, chunk);
  }
  return choice?.delta?.content || null;
}

/**
 * Turns raw response bytes into text deltas.
 * @param body Response body bytes.
 * @throws AiBadResponseException when the stream ends without any content.
 */
export function parseOpenRouterStream(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  return parseLineStream(body, parseOpenRouterChunk);
}
