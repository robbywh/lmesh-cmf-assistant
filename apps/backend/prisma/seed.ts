import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";

loadEnv({ path: [".env", "../../.env"], quiet: true });

const SEED_USER = {
  email: "test@lmesh.eu",
  password: "password",
  name: "Test Designer",
} as const;

const BCRYPT_ROUNDS = 10;

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
    const passwordHash = await hash(SEED_USER.password, BCRYPT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email: SEED_USER.email },
      update: {},
      create: { email: SEED_USER.email, name: SEED_USER.name, passwordHash },
    });
    console.log(`Seeded user ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed", error);
  process.exit(1);
});
