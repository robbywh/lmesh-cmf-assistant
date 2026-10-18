import { z } from "zod";

import { IdSchema, TimestampSchema } from "./common.js";
import { ErrorCodeSchema } from "./error-codes.js";
import { MESSAGE_CONTENT_MAX } from "./limits.js";

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/** `summary` marks assistant messages produced by the Summarise action. */
export const MessageKindSchema = z.enum(["chat", "summary"]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

/** Lifecycle: streaming -> complete | error | aborted; error/aborted -> streaming on retry. */
export const MessageStatusSchema = z.enum([
  "streaming",
  "complete",
  "error",
  "aborted",
]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  role: MessageRoleSchema,
  /** Always `chat` for user messages. */
  kind: MessageKindSchema,
  /** May be empty while streaming or after an error/abort. */
  content: z.string(),
  /** Always `complete` for user messages. */
  status: MessageStatusSchema,
  /** Set only when `status` is `error`. */
  errorCode: ErrorCodeSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageIdParamsSchema = z.object({ messageId: IdSchema });
export type MessageIdParams = z.infer<typeof MessageIdParamsSchema>;

/** Body of `POST /api/v1/projects/:projectId/messages`. */
export const SendMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_CONTENT_MAX),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
