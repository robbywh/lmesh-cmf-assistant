import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when a downstream dependency (database, AI provider, ...) is unreachable (503). */
export class ServiceUnavailableException extends AppException {
  constructor(
    message = "Service temporarily unavailable",
    code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE,
    cause?: unknown,
  ) {
    super(message, code, HttpStatus.SERVICE_UNAVAILABLE, undefined, cause);
  }
}
