/**
 * Machine-readable error codes returned in the `code` field of every error response.
 * Clients should branch on these values rather than on HTTP status or message text.
 */
export enum ErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}
