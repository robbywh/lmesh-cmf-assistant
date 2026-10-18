import type { ErrorEnvelope } from "@lmesh/api-contract";
import { HttpException, HttpStatus } from "@nestjs/common";

import { ErrorCode } from "./error-code.enum";

/** Field-level validation messages, keyed by property path. */
export type FieldErrors = NonNullable<ErrorEnvelope["errors"]>;

/** Serialized shape of every error response produced by the API (from the contract). */
export type ErrorResponseBody = ErrorEnvelope;

/**
 * Base class for every exception the application throws on purpose.
 * Concrete exceptions in `common/exceptions/` extend this; feature code must
 * never throw `Error` or a raw `HttpException` directly.
 */
export abstract class AppException extends HttpException {
  /**
   * @param message Human-readable message safe to show to API clients.
   * @param code Machine-readable error code.
   * @param status HTTP status code for the response.
   * @param errors Optional field-level validation errors.
   * @param cause Optional underlying error, kept for logging only.
   */
  protected constructor(
    message: string,
    public readonly code: ErrorCode,
    status: HttpStatus,
    public readonly errors?: FieldErrors,
    cause?: unknown,
  ) {
    super(message, status, { cause });
  }

  /**
   * Builds the response body sent to the client.
   * @returns The `{ message, code, errors? }` error payload.
   */
  public toResponseBody(): ErrorResponseBody {
    return {
      message: this.message,
      code: this.code,
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}
