import { z } from "zod";

import { TimestampSchema } from "./common.js";

/** Payload of `GET /api/v1/health`. */
export const HealthSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("up"),
  /** Process uptime in seconds. */
  uptime: z.number(),
  timestamp: TimestampSchema,
});

export type Health = z.infer<typeof HealthSchema>;
