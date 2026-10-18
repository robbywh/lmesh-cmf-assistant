import { createZodValidationPipe } from "nestjs-zod";
import { ZodError } from "zod";

import { FieldErrors, ValidationException } from "../exceptions";

/** Field-error key used for issues that are not attached to a property. */
export const ROOT_ERROR_KEY = "_root";

/**
 * Groups Zod issues by dotted property path (`a.b.0.c`).
 * @param error Error reported by a Zod schema.
 * @returns Field errors keyed by property path; root-level issues use `_root`.
 */
export function flattenZodIssues(error: ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((acc, issue) => {
    const path = issue.path.length ? issue.path.join(".") : ROOT_ERROR_KEY;
    (acc[path] ??= []).push(issue.message);
    return acc;
  }, {});
}

/**
 * Maps a failed Zod parse to the API's `400 VALIDATION_FAILED` exception.
 * @param error The error nestjs-zod caught (a `ZodError` in practice).
 * @returns The exception to throw.
 */
export function createValidationException(error: unknown): Error {
  if (error instanceof ZodError) {
    return new ValidationException(flattenZodIssues(error));
  }
  return new ValidationException({ [ROOT_ERROR_KEY]: ["Invalid request"] });
}

/**
 * Global validation pipe: validates `@Body()`, `@Query()` and `@Param()`
 * values typed with a `createZodDto(...)` class against the contract's Zod
 * schema, passes on the parsed (trimmed, defaulted) value, and reports failures
 * as a `ValidationException`. Values not typed with a Zod DTO pass through.
 */
export class ZodRequestValidationPipe extends createZodValidationPipe({
  createValidationException,
}) {}
