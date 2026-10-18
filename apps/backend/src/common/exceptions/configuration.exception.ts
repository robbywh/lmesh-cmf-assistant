import { HttpStatus } from "@nestjs/common";

import { AppException } from "./app.exception";
import { ErrorCode } from "./error-code.enum";

/**
 * Thrown at boot when the environment is invalid. It runs before Nest bootstraps,
 * so no filter handles it: the process fails fast and prints the message.
 */
export class ConfigurationException extends AppException {
  constructor(message: string) {
    super(message, ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
