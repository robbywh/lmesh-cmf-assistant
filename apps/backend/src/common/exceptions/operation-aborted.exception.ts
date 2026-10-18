import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** nginx's "client closed request"; internal only, never sent to a client. */
const CLIENT_CLOSED_REQUEST = 499 as HttpStatus;

/**
 * Abort reason for an operation that was cancelled (client left, signal aborted
 * with a non-Error reason). Internal: it ends a stream and is never serialised.
 * `name` is `AbortError` so it reads like the platform's own abort errors.
 */
export class OperationAbortedException extends AppException {
  constructor(message = "The operation was aborted") {
    super(message, ErrorCode.INTERNAL_ERROR, CLIENT_CLOSED_REQUEST);
    this.name = "AbortError";
  }
}
