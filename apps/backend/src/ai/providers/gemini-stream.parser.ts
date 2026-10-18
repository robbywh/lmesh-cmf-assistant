import { z } from "zod";

import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";
import { parseLineStream, STREAM_DONE } from "./stream.utils";

/** Finish reasons that mean the model refused or the content was blocked. */
const BLOCKED_FINISH_REASONS: ReadonlySet<string> = new Set([
  "SAFETY",
  "BLOCKED",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

const ChunkSchema = z.looseObject({
  error: z.unknown().optional(),
  promptFeedback: z
    .looseObject({ blockReason: z.string().nullish() })
    .nullish(),
  candidates: z
    .array(
      z.looseObject({
        finishReason: z.string().nullish(),
        content: z
          .looseObject({
            parts: z
              .array(
                z.looseObject({
                  text: z.string().nullish(),
                  thought: z.boolean().nullish(),
                }),
              )
              .nullish(),
          })
          .nullish(),
      }),
    )
    .optional(),
});

/**
 * Parses one line of a Gemini `streamGenerateContent?alt=sse` body.
 * @param line A single line without its line terminator.
 * @returns The text delta, or `null` when the line carries no text.
 * @throws AiProviderErrorException for an error object, a blocked prompt or a safety stop.
 * @throws AiBadResponseException for invalid JSON or an unexpected shape.
 */
export function parseGeminiChunk(
  line: string,
): string | null | typeof STREAM_DONE {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice("data:".length).trim();
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
  if (chunk.promptFeedback?.blockReason) {
    throw new AiProviderErrorException(undefined, chunk.promptFeedback);
  }
  const candidate = chunk.candidates?.[0];
  if (
    candidate?.finishReason &&
    BLOCKED_FINISH_REASONS.has(candidate.finishReason)
  ) {
    throw new AiProviderErrorException(undefined, candidate.finishReason);
  }
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  return text || null;
}

/**
 * Turns raw response bytes into text deltas.
 * @param body Response body bytes.
 * @throws AiBadResponseException when the stream ends without any content.
 */
export function parseGeminiStream(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  return parseLineStream(body, parseGeminiChunk);
}
