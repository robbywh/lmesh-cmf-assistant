import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when an action conflicts with an AI reply that is still streaming (409). */
export class StreamInProgressException extends AppException {
  constructor(message = "A response is still being generated") {
    super(message, ErrorCode.STREAM_IN_PROGRESS, HttpStatus.CONFLICT);
  }
}
