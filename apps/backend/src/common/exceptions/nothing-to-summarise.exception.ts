import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when a summary is requested before the assistant has replied (409). */
export class NothingToSummariseException extends AppException {
  constructor(message = "There is nothing to summarise yet") {
    super(message, ErrorCode.NOTHING_TO_SUMMARISE, HttpStatus.CONFLICT);
  }
}
