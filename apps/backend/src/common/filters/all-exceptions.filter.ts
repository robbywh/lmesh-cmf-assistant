import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { AppException, ErrorCode, ErrorResponseBody } from "../exceptions";

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

const INTERNAL_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface NormalizedError {
  status: number;
  body: ErrorResponseBody;
}

/**
 * Global exception filter: converts every thrown value into the standard
 * `{ message, code, errors? }` error body. Unexpected errors are logged and
 * reported as a generic 500 so internals never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Writes the normalized error response to the Fastify reply.
   * @param exception The thrown value.
   * @param host Execution context arguments.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { status, body } = this.normalize(exception);

    if (status >= INTERNAL_ERROR_STATUS) {
      this.logFailure(exception, body.message);
    }

    if (reply.sent) {
      // Headers already flushed (e.g. mid-stream); nothing more can be sent.
      return;
    }

    void reply.status(status).send(body);
  }

  private logFailure(exception: unknown, message: string): void {
    if (exception instanceof AppException) {
      // Anticipated failure (e.g. dependency down); the cause carries the detail.
      const cause =
        exception.cause instanceof Error ? `: ${exception.cause.message}` : "";
      this.logger.warn(`${message}${cause}`);
      return;
    }
    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : String(exception),
    );
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: exception.toResponseBody(),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          message: this.extractHttpMessage(exception),
          code: STATUS_TO_CODE[status] ?? this.fallbackCode(status),
        },
      };
    }

    // Fastify framework errors (e.g. malformed JSON body) carry a 4xx statusCode.
    const statusCode = this.extractStatusCode(exception);
    if (statusCode !== undefined && statusCode < INTERNAL_ERROR_STATUS) {
      return {
        status: statusCode,
        body: {
          message:
            exception instanceof Error ? exception.message : "Bad request",
          code: STATUS_TO_CODE[statusCode] ?? ErrorCode.BAD_REQUEST,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        message: "Internal server error",
        code: ErrorCode.INTERNAL_ERROR,
      },
    };
  }

  private extractHttpMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === "string") {
      return response;
    }
    const message = (response as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join(", ");
    }
    return exception.message;
  }

  private extractStatusCode(exception: unknown): number | undefined {
    if (typeof exception !== "object" || exception === null) {
      return undefined;
    }
    const statusCode = (exception as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? statusCode : undefined;
  }

  private fallbackCode(status: number): ErrorCode {
    return status >= INTERNAL_ERROR_STATUS
      ? ErrorCode.INTERNAL_ERROR
      : ErrorCode.BAD_REQUEST;
  }
}
