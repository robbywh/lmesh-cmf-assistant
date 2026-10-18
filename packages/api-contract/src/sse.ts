import { z } from "zod";

import { IdSchema } from "./common.js";
import { ErrorCodeSchema } from "./error-codes.js";
import { MessageSchema } from "./messages.js";

/**
 * SSE events of the streaming endpoints (send, summarise, retry). Each event is
 * written as `event: <type>\ndata: <json>\n\n`; the `event:` name equals
 * `type`. Heartbeats are comment lines (`: ping`) and carry no event.
 */
export const SseEventType = {
  MESSAGE_CREATED: "message.created",
  TOKEN: "token",
  DONE: "done",
  ERROR: "error",
} as const;
export type SseEventType = (typeof SseEventType)[keyof typeof SseEventType];

/** First event. `userMessage` is null for summarise and retry. */
export const MessageCreatedEventSchema = z.object({
  type: z.literal(SseEventType.MESSAGE_CREATED),
  userMessage: MessageSchema.nullable(),
  /** `status: streaming`, `content: ""`. */
  assistantMessage: MessageSchema,
});
export type MessageCreatedEvent = z.infer<typeof MessageCreatedEventSchema>;

/** One non-empty text chunk from the provider. */
export const TokenEventSchema = z.object({
  type: z.literal(SseEventType.TOKEN),
  messageId: IdSchema,
  delta: z.string().min(1),
});
export type TokenEvent = z.infer<typeof TokenEventSchema>;

/** Last event on success: the saved assistant message (`status: complete`). */
export const DoneEventSchema = z.object({
  type: z.literal(SseEventType.DONE),
  message: MessageSchema,
});
export type DoneEvent = z.infer<typeof DoneEventSchema>;

/**
 * Last event on failure after the stream started. The message is already
 * saved with `status: error`. `message` is safe, user-facing text.
 */
export const ErrorEventSchema = z.object({
  type: z.literal(SseEventType.ERROR),
  messageId: IdSchema,
  code: ErrorCodeSchema,
  message: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const SseEventSchema = z.discriminatedUnion("type", [
  MessageCreatedEventSchema,
  TokenEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
