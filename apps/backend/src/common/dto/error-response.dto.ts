import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { ErrorCode } from "../exceptions";

/** Swagger model for the standard error response body. */
export class ErrorResponseDto {
  @ApiProperty({ example: "Validation failed" })
  message!: string;

  @ApiProperty({
    enum: ErrorCode,
    enumName: "ErrorCode",
    example: ErrorCode.VALIDATION_FAILED,
  })
  code!: ErrorCode;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: { type: "array", items: { type: "string" } },
    example: { email: ["email must be an email"] },
  })
  errors?: Record<string, string[]>;
}
