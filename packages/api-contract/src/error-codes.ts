import { z } from "zod";

/**
 * Machine-readable error codes returned in the `code` field of every error
 * envelope and in SSE `error` events. Clients branch on these values, never on
 * HTTP status or message text.
 */
export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  STREAM_IN_PROGRESS: "STREAM_IN_PROGRESS",
  MESSAGE_NOT_RETRYABLE: "MESSAGE_NOT_RETRYABLE",
  NOTHING_TO_SUMMARISE: "NOTHING_TO_SUMMARISE",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_BAD_RESPONSE: "AI_BAD_RESPONSE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorCodeSchema = z.enum(ErrorCode);
