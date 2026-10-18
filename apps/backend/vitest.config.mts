import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * NestJS relies on legacy decorators and `emitDecoratorMetadata` for
 * dependency injection. SWC (the transform the NestJS docs recommend for
 * Vitest) compiles the TypeScript with both, read from tsconfig.json, and
 * Vite's built-in oxc transform is disabled so only one transform runs.
 *
 * Paths are relative to this file's directory (the Vitest root).
 * `.mts` so Vite loads it as ESM (the backend package is CommonJS).
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
  oxc: false,
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.spec.ts", "test/**/*.e2e.spec.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/main.ts", "src/**/*.spec.ts"],
      reportsDirectory: "coverage",
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
