import { Prisma } from "../../generated/prisma/client";

/**
 * True when a database write failed on a unique constraint or unique index
 * (Prisma `P2002`, or the raw Postgres error the driver adapter may surface).
 * @param error The caught value.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  return /unique constraint|23505/i.test(String((error as Error)?.message));
}
