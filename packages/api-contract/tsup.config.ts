import { defineConfig } from "tsup";

/**
 * Dual ESM + CJS build: apps/backend is CommonJS (Nest, Prisma cjs client) and
 * apps/frontend is ESM (Vite). Each format gets its own declaration file.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2023",
});
