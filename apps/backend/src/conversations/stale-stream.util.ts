import type { PrismaClient } from "../generated/prisma/client";

/** Extra time a `streaming` row may outlive the AI request timeout before it counts as crashed. */
export const STALE_STREAM_GRACE_MS = 30_000;

/** Anything that can update messages: the Prisma client or a transaction client. */
export type MessageDb = Pick<PrismaClient, "message">;

export type StaleStreamScope =
  { conversationId: string } | { projectId: string };

/**
 * A `streaming` message last touched before this instant is stale (FR-CHAT-09).
 * @param now Current time.
 * @param requestTimeoutMs `AI_REQUEST_TIMEOUT_MS`.
 * @returns The cutoff instant.
 */
export function staleStreamingCutoff(
  now: Date,
  requestTimeoutMs: number,
): Date {
  return new Date(now.getTime() - requestTimeoutMs - STALE_STREAM_GRACE_MS);
}

/**
 * Flips stale `streaming` messages to `error` / `AI_TIMEOUT` so a crashed
 * stream never blocks the conversation, a reset or a project delete.
 * @param db Prisma client or transaction client.
 * @param scope One conversation, or every conversation of a project.
 * @param cutoff Result of `staleStreamingCutoff`.
 * @returns How many rows were flipped.
 */
export async function markStaleStreamingAsError(
  db: MessageDb,
  scope: StaleStreamScope,
  cutoff: Date,
): Promise<number> {
  const { count } = await db.message.updateMany({
    where: {
      status: "streaming",
      updatedAt: { lt: cutoff },
      ...("conversationId" in scope
        ? { conversationId: scope.conversationId }
        : { conversation: { projectId: scope.projectId } }),
    },
    data: { status: "error", errorCode: "AI_TIMEOUT" },
  });
  return count;
}
