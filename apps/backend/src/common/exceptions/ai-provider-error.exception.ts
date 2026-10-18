import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/** Thrown when the AI provider answers with an HTTP error or an error in its stream (502). */
export class AiProviderErrorException extends AppException {
  constructor(message = "The AI service returned an error", cause?: unknown) {
    super(
      message,
      ErrorCode.AI_PROVIDER_ERROR,
      HttpStatus.BAD_GATEWAY,
      undefined,
      cause,
    );
  }
}
