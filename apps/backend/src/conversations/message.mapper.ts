import type { ErrorCode, Message } from "@lmesh/api-contract";

import type { Message as MessageRow } from "../generated/prisma/client";

/**
 * Maps a Prisma message row to the contract `Message` (ISO timestamps).
 * @param row Message row from Prisma.
 * @returns The API representation.
 */
export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    status: row.status,
    errorCode: row.errorCode as ErrorCode | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
