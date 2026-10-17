import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the app-local .env first, then fall back to the monorepo root .env.
loadEnv({ path: [".env", "../../.env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` does not need a database, so tolerate an unset URL
    // (e.g. during the Docker build stage).
    url: process.env.DATABASE_URL ?? "",
  },
});
