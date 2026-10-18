import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when the AI provider is not configured or cannot be reached (503). */
export class AiUnavailableException extends AppException {
  constructor(
    message = "The AI service is currently unavailable",
    cause?: unknown,
  ) {
    super(
      message,
      ErrorCode.AI_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE,
      undefined,
      cause,
    );
  }
}
