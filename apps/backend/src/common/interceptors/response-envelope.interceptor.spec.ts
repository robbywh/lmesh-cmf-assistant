import { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";

import { RAW_RESPONSE_KEY, RESPONSE_MESSAGE_KEY } from "../decorators";
import { ResponseEnvelopeInterceptor } from "./response-envelope.interceptor";

describe("ResponseEnvelopeInterceptor", () => {
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  function run(
    value: unknown,
    metadata: Record<string, unknown> = {},
  ): Promise<unknown> {
    const reflector = {
      getAllAndOverride: (key: string) => metadata[key],
    } as unknown as Reflector;
    const next: CallHandler = { handle: () => of(value) };
    return lastValueFrom(
      new ResponseEnvelopeInterceptor(reflector).intercept(context, next),
    );
  }

  it("wraps the handler result in { data }", async () => {
    await expect(run({ id: 1 })).resolves.toEqual({ data: { id: 1 } });
  });

  it("adds the @ResponseMessage message and normalizes undefined to null", async () => {
    await expect(
      run(undefined, { [RESPONSE_MESSAGE_KEY]: "Conversation reset" }),
    ).resolves.toEqual({
      data: null,
      message: "Conversation reset",
    });
  });

  it("passes @RawResponse handlers through untouched", async () => {
    await expect(run("raw", { [RAW_RESPONSE_KEY]: true })).resolves.toBe("raw");
  });
});
