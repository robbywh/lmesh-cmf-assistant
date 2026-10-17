import { config as baseConfig } from "@repo/eslint-config/base";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Backend ESLint config: the shared base (recommended rules, prettier,
 * turbo, only-warn) with the Babel parser swapped for typescript-eslint,
 * which understands Nest's parameter decorators and enables type-aware rules.
 */
export default tseslint.config(
  ...baseConfig,
  {
    ignores: ["dist/**", "coverage/**", "src/generated/**", "eslint.config.mjs", "jest.config.js"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          accessibility: "explicit",
          overrides: { constructors: "no-public", properties: "off", parameterProperties: "off" },
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      // Tests stub env vars directly; runtime config goes through ConfigModule.
      "turbo/no-undeclared-env-vars": "off",
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
);
