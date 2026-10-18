import { execSync } from "node:child_process";

import { Client } from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://lmesh:lmesh@localhost:5432/lmesh_cmf_test?schema=public";

const DUPLICATE_DATABASE = "42P04";

/**
 * Creates the test database if missing. Safe against concurrent callers
 * (two processes racing on a fresh volume): a duplicate-database error is fine.
 */
export async function createTestDatabaseIfMissing(): Promise<void> {
  const admin = new URL(TEST_DATABASE_URL);
  const name = admin.pathname.slice(1);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (rowCount) return;
    try {
      await client.query(`CREATE DATABASE "${name}"`);
    } catch (error) {
      if ((error as { code?: string }).code !== DUPLICATE_DATABASE) throw error;
    }
  } finally {
    await client.end();
  }
}

/** Applies all migrations to the test database (Prisma serialises this with an advisory lock). */
export function migrateTestDatabase(): void {
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
