import { ActiveConversationSchema, successEnvelope } from "@lmesh/api-contract";
import { createZodDto } from "nestjs-zod";

/** Swagger model for `{ data: ActiveConversation }`. */
export class ActiveConversationResponseDto extends createZodDto(
  successEnvelope(ActiveConversationSchema),
) {}
