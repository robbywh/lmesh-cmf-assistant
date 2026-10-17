import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";

import { RAW_RESPONSE_KEY, RESPONSE_MESSAGE_KEY } from "../decorators";

/** Standard success response body. */
export interface SuccessResponse<T> {
  data: T;
  message?: string;
  code?: string;
}

/**
 * Global interceptor that wraps handler return values in the standard
 * `{ data, message? }` success envelope. Handlers decorated with
 * `@RawResponse()` are passed through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Wraps the handler result in a success envelope.
   * @param context Current execution context.
   * @param next Handler invocation.
   * @returns The enveloped response stream.
   */
  public intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T> | T> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, targets)) {
      return next.handle();
    }

    const message = this.reflector.getAllAndOverride<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      targets,
    );

    return next.handle().pipe(
      map((data) => ({
        data: data ?? (null as T),
        ...(message ? { message } : {}),
      })),
    );
  }
}
