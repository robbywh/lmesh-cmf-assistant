import { ErrorCode } from "@lmesh/api-contract";

const FALLBACK = "Something went wrong. Please try again.";

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.AI_TIMEOUT]: "The assistant took too long to respond.",
  [ErrorCode.AI_UNAVAILABLE]:
    "The AI provider isn't reachable right now. Check the server configuration.",
  [ErrorCode.AI_PROVIDER_ERROR]: "The AI provider returned an error. Please try again.",
  [ErrorCode.AI_BAD_RESPONSE]: "The assistant's reply couldn't be read. Please try again.",
  [ErrorCode.STREAM_IN_PROGRESS]: "An answer is already being generated.",
  [ErrorCode.MESSAGE_NOT_RETRYABLE]: "This message can't be retried anymore.",
  [ErrorCode.NOTHING_TO_SUMMARISE]: "There's nothing to summarise yet.",
};

/** Friendly inline text for an error code (FSD 11.3); unknown codes get the generic message. */
export function errorMessageFor(code: ErrorCode | null | undefined): string {
  return (code && MESSAGES[code]) || FALLBACK;
}
