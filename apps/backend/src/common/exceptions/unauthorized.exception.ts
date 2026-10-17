import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when the caller is not authenticated or their credentials are invalid (401). */
export class UnauthorizedException extends AppException {
  constructor(message = "Authentication required") {
    super(message, ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
  }
}
