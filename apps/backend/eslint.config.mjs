import { config as nestConfig } from "@lmesh/eslint-config/nest";

/**
 * Backend ESLint config: the shared NestJS preset (typescript-eslint with
 * type-aware rules, Node globals, Vitest test-file overrides).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  {
    ignores: ["dist/**", "coverage/**", "src/generated/**"],
  },
  ...nestConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Prisma CLI entry points read DATABASE_URL directly; they are not cached
    // turbo tasks, so turbo's env hashing does not apply.
    files: ["prisma/**/*.ts", "prisma.config.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
