import { z } from "zod";

import { ErrorCodeSchema } from "./error-codes.js";

/**
 * Success envelope `{ data, message?, code? }` wrapping a payload schema.
 * @param data Schema of the `data` payload.
 */
export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    message: z.string().optional(),
    code: z.string().optional(),
  });
}

export type SuccessEnvelope<T> = {
  data: T;
  message?: string;
  code?: string;
};

/** Error envelope `{ message, code, errors? }` returned for every JSON error. */
export const ErrorEnvelopeSchema = z.object({
  message: z.string(),
  code: ErrorCodeSchema,
  /** Per-field validation messages keyed by field path (only for VALIDATION_FAILED). */
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
