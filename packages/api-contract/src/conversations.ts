import { z } from "zod";

import { IdSchema, TimestampSchema } from "./common.js";
import { MessageSchema } from "./messages.js";

/**
 * `data` of `GET /api/v1/projects/:projectId/conversations/active` and of the
 * reset endpoint `POST /api/v1/projects/:projectId/conversations`.
 */
export const ActiveConversationSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  createdAt: TimestampSchema,
  /** Ordered by `createdAt` ascending, then `id`. */
  messages: z.array(MessageSchema),
});
export type ActiveConversation = z.infer<typeof ActiveConversationSchema>;
