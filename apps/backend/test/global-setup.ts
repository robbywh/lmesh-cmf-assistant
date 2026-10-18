import { PrismaPg } from "@prisma/adapter-pg";

import { seedUser } from "../prisma/seed-user";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  createTestDatabaseIfMissing,
  migrateTestDatabase,
  TEST_DATABASE_URL,
} from "./support/test-database";

/**
 * Runs once before all test files (not per worker): creates the test database,
 * migrates it and seeds the seed user, so parallel files never race on setup.
 * Start Postgres with `docker compose up -d postgres`.
 */
export default async function setup(): Promise<void> {
  await createTestDatabaseIfMissing();
  migrateTestDatabase();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });
  try {
    await seedUser(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
