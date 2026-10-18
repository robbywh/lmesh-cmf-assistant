import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when the request is understood but not allowed, e.g. a foreign Origin (403). */
export class ForbiddenException extends AppException {
  constructor(message = "Forbidden") {
    super(message, ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN);
  }
}
