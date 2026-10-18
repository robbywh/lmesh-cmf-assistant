import { ErrorEnvelopeSchema } from "@lmesh/api-contract";
import { createZodDto } from "nestjs-zod";

/** Swagger model for the standard error response body (the contract's `ErrorEnvelope`). */
export class ErrorResponseDto extends createZodDto(ErrorEnvelopeSchema) {}
