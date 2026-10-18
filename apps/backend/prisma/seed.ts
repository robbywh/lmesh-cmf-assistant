import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { seedSampleProjects } from "./seed-data";
import { seedUser } from "./seed-user";

loadEnv({ path: [".env", "../../.env"], quiet: true });

/**
 * Idempotent seed: safe to run on every container start.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run the seed");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const email = await seedUser(prisma);
    console.log(`Seeded user ${email}`);
    const created = await seedSampleProjects(prisma, email);
    console.log(`Seeded ${created} sample project(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed", error);
  process.exit(1);
});
