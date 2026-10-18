import type { ActiveConversation } from "@lmesh/api-contract";

import type {
  Conversation as ConversationRow,
  Message as MessageRow,
} from "../generated/prisma/client";
import { toMessage } from "./message.mapper";

/**
 * Maps a conversation and its (already ordered) messages to the contract shape.
 * @param row Conversation row.
 * @param messages Messages ordered by createdAt then id.
 */
export function toActiveConversation(
  row: ConversationRow,
  messages: MessageRow[],
): ActiveConversation {
  return {
    id: row.id,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    messages: messages.map(toMessage),
  };
}
