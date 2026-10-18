import type { ErrorCode } from "@lmesh/api-contract";

import {
  AiTimeoutException,
  AppException,
  ErrorCode as Codes,
} from "../common/exceptions";

export type StreamFailure =
  { kind: "aborted" } | { kind: "error"; code: ErrorCode; unexpected: boolean };

const AI_CODES: ReadonlySet<string> = new Set([
  Codes.AI_UNAVAILABLE,
  Codes.AI_TIMEOUT,
  Codes.AI_PROVIDER_ERROR,
  Codes.AI_BAD_RESPONSE,
]);

/** Safe, user-facing text per error code (FSD 11.3); never provider text. */
export const SAFE_ERROR_MESSAGES: Record<string, string> = {
  [Codes.AI_TIMEOUT]: "The assistant took too long to respond.",
  [Codes.AI_UNAVAILABLE]:
    "The AI provider isn't reachable right now. Check the server configuration.",
  [Codes.AI_PROVIDER_ERROR]:
    "The AI provider returned an error. Please try again.",
  [Codes.AI_BAD_RESPONSE]:
    "The assistant's reply couldn't be read. Please try again.",
  [Codes.INTERNAL_ERROR]: "Something went wrong. Please try again.",
};

/**
 * Decides how a failed stream ends. The abort reason wins over the thrown value,
 * so a timeout during a slow provider failure is still `AI_TIMEOUT`.
 * @param error What the provider iteration threw.
 * @param signal The stream's combined abort signal.
 */
export function classifyFailure(
  error: unknown,
  signal: AbortSignal,
): StreamFailure {
  if (signal.aborted) {
    if (signal.reason instanceof AiTimeoutException) {
      return { kind: "error", code: Codes.AI_TIMEOUT, unexpected: false };
    }
    return { kind: "aborted" };
  }
  if (error instanceof AppException && AI_CODES.has(error.code)) {
    return { kind: "error", code: error.code, unexpected: false };
  }
  return { kind: "error", code: Codes.INTERNAL_ERROR, unexpected: true };
}
