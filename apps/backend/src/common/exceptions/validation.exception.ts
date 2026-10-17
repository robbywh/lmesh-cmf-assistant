import { HttpStatus } from "@nestjs/common";

import { AppException, FieldErrors } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when request input fails validation (400). */
export class ValidationException extends AppException {
  constructor(errors: FieldErrors, message = "Validation failed") {
    super(message, ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, errors);
  }
}
