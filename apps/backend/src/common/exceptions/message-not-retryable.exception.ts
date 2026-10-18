import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when a retry targets anything but the last failed or aborted assistant message of the active conversation (409). */
export class MessageNotRetryableException extends AppException {
  constructor(message = "This message cannot be retried") {
    super(message, ErrorCode.MESSAGE_NOT_RETRYABLE, HttpStatus.CONFLICT);
  }
}
