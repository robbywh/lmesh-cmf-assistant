import { SetMetadata } from "@nestjs/common";

export const RESPONSE_MESSAGE_KEY = "response:message";

/**
 * Attaches a `message` to the success envelope produced by `ResponseEnvelopeInterceptor`.
 * @param message Human-readable message, e.g. "Project created".
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
