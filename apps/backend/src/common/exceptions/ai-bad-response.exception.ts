import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when the AI provider's response is malformed or contains no content (502). */
export class AiBadResponseException extends AppException {
  constructor(
    message = "The AI service returned an invalid response",
    cause?: unknown,
  ) {
    super(
      message,
      ErrorCode.AI_BAD_RESPONSE,
      HttpStatus.BAD_GATEWAY,
      undefined,
      cause,
    );
  }
}
