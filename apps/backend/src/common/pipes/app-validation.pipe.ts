import { ValidationError, ValidationPipe } from "@nestjs/common";

import { FieldErrors, ValidationException } from "../exceptions";

/**
 * Flattens nested class-validator errors into `{ "path.to.field": [messages] }`.
 * @param errors Errors reported by class-validator.
 * @param parentPath Property path of the parent object, if any.
 * @returns Field errors keyed by dotted property path.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = "",
): FieldErrors {
  return errors.reduce<FieldErrors>((acc, error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      acc[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(acc, flattenValidationErrors(error.children, path));
    }
    return acc;
  }, {});
}

/**
 * Global validation pipe: strips unknown properties, rejects non-whitelisted
 * ones, transforms payloads into DTO instances and reports failures as a
 * `ValidationException` with per-field messages.
 */
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ValidationException(flattenValidationErrors(errors)),
    });
  }
}
