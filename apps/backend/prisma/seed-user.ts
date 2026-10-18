import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "../src/generated/prisma/client";

export const SEED_USER = {
  email: "test@lmesh.eu",
  password: "password",
  name: "Test Designer",
} as const;

/**
 * Runs an upsert and retries once when a concurrent upsert wins the race on the
 * unique key (Prisma falls back to read-then-write when the update is empty).
 */
async function retryOnUniqueViolation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return operation();
  }
}

export interface CredentialUserInput {
  email: string;
  name: string;
  password: string;
}

/**
 * Idempotently creates a user and its credential account, hashing the password
 * with better-auth's own hasher so sign-in verifies it. An existing account's
 * password is left untouched.
 * @param prisma Prisma client to write with.
 * @param input Email, display name and plain password.
 * @returns The user's id.
 */
export async function ensureCredentialUser(
  prisma: PrismaClient,
  input: CredentialUserInput,
): Promise<string> {
  const user = await retryOnUniqueViolation(() =>
    prisma.user.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email, name: input.name, emailVerified: true },
    }),
  );

  // Upsert on the unique (provider_id, account_id) so concurrent seeds cannot duplicate it.
  await retryOnUniqueViolation(async () =>
    prisma.account.upsert({
      where: {
        providerId_accountId: { providerId: "credential", accountId: user.id },
      },
      update: {},
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        // better-auth/crypto re-exports a type from a transitive package that the
        // backend's Node10 module resolution cannot follow, so the call is untyped.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        password: await hashPassword(input.password),
      },
    }),
  );
  return user.id;
}

/**
 * Idempotently creates the documented seed user (test@lmesh.eu).
 * @param prisma Prisma client to write with.
 * @returns The seeded user's email.
 */
export async function seedUser(prisma: PrismaClient): Promise<string> {
  await ensureCredentialUser(prisma, SEED_USER);
  return SEED_USER.email;
}
