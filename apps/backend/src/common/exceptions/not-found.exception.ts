import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when a requested resource does not exist or is not visible to the caller (404). */
export class NotFoundException extends AppException {
  constructor(message = "Resource not found") {
    super(message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
  }
}
