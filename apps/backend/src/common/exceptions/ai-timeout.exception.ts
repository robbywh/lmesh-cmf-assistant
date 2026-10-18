import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown by the chat stream timers when the AI provider is too slow (504); never by an adapter. */
export class AiTimeoutException extends AppException {
  constructor(
    message = "The AI service took too long to respond",
    cause?: unknown,
  ) {
    super(
      message,
      ErrorCode.AI_TIMEOUT,
      HttpStatus.GATEWAY_TIMEOUT,
      undefined,
      cause,
    );
  }
}
