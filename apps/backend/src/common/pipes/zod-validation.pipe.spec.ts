import { CreateProjectRequestSchema, ErrorCode } from "@lmesh/api-contract";
import { ArgumentMetadata } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ValidationException } from "../exceptions";
import {
  createValidationException,
  flattenZodIssues,
  ROOT_ERROR_KEY,
  ZodRequestValidationPipe,
} from "./zod-validation.pipe";

class CreateProjectDto extends createZodDto(CreateProjectRequestSchema) {}

const bodyMetadata: ArgumentMetadata = {
  type: "body",
  metatype: CreateProjectDto,
};

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("ZodRequestValidationPipe", () => {
  const pipe = new ZodRequestValidationPipe();

  it("returns the parsed value with strings trimmed", () => {
    const result: unknown = pipe.transform(
      { title: "  Alpine concept  ", description: "  Matte finish " },
      bodyMetadata,
    );

    expect(result).toEqual({
      title: "Alpine concept",
      description: "Matte finish",
    });
  });

  it("throws ValidationException with VALIDATION_FAILED and per-field errors", () => {
    const error = catchError(() =>
      pipe.transform({ title: "   " }, bodyMetadata),
    );

    expect(error).toBeInstanceOf(ValidationException);
    const exception = error as ValidationException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(exception.toResponseBody().errors?.title?.length).toBeGreaterThan(0);
  });

  it("reports a missing required field under its key", () => {
    const error = catchError(() => pipe.transform({}, bodyMetadata));

    expect(error).toBeInstanceOf(ValidationException);
    expect(Object.keys((error as ValidationException).errors ?? {})).toContain(
      "title",
    );
  });

  it("passes through values that are not typed with a Zod DTO", () => {
    expect(pipe.transform("abc", { type: "param", metatype: String })).toBe(
      "abc",
    );
  });
});

describe("flattenZodIssues", () => {
  it("keys nested issues by dotted path and root issues by _root", () => {
    const nested = CreateProjectRequestSchema.safeParse({
      title: "ok",
      description: 5,
    });
    const root = CreateProjectRequestSchema.safeParse("nope");

    expect(Object.keys(flattenZodIssues(nested.error!))).toEqual([
      "description",
    ]);
    expect(Object.keys(flattenZodIssues(root.error!))).toEqual([
      ROOT_ERROR_KEY,
    ]);
  });
});

describe("nested paths and non-Zod errors", () => {
  const Nested = z.object({
    a: z.object({ b: z.array(z.object({ c: z.string().min(2) })) }),
    list: z.array(z.string().min(1)),
  });

  it("keys a deeply nested issue by its dotted path (a.b.0.c) and array items by index", () => {
    const result = Nested.safeParse({
      a: { b: [{ c: "x" }] },
      list: ["ok", ""],
    });

    expect(Object.keys(flattenZodIssues(result.error!)).sort()).toEqual([
      "a.b.0.c",
      "list.1",
    ]);
  });

  it("collects several messages under the same path", () => {
    const schema = z.object({ v: z.string().min(5).regex(/^\d+$/) });
    const result = schema.safeParse({ v: "ab" });

    expect(flattenZodIssues(result.error!).v).toHaveLength(2);
  });

  it("maps a non-Zod error to ValidationException with a generic _root message", () => {
    const exception = createValidationException(
      new Error("boom"),
    ) as ValidationException;

    expect(exception).toBeInstanceOf(ValidationException);
    expect(exception.errors).toEqual({ [ROOT_ERROR_KEY]: ["Invalid request"] });
  });
});
