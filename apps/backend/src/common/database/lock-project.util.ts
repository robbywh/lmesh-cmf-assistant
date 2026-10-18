import type { Prisma } from "../../generated/prisma/client";

/**
 * Takes a row lock on a project for the rest of the transaction. Send, summarise,
 * retry, reset and delete all take it first, so they run one at a time per project
 * and none can act on a conversation another has just archived or deleted.
 * @param tx Transaction client.
 * @param projectId The project to lock.
 */
export async function lockProject(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  projectId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
}
