import { ValidationError } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { flattenValidationErrors } from "./app-validation.pipe";

describe("flattenValidationErrors", () => {
  it("flattens nested errors into dotted field paths", () => {
    const errors: ValidationError[] = [
      {
        property: "title",
        constraints: { isNotEmpty: "title should not be empty" },
        children: [],
      },
      {
        property: "context",
        children: [
          {
            property: "materials",
            constraints: { isArray: "materials must be an array" },
            children: [],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual({
      title: ["title should not be empty"],
      "context.materials": ["materials must be an array"],
    });
  });
});
