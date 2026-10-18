import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import onlyWarn from "eslint-plugin-only-warn";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * Shared base for every workspace: ESLint recommended + typescript-eslint
 * recommended (syntax-only, no type information), Turborepo env-var checks and
 * Prettier compatibility.
 *
 * typescript-eslint parses with the TypeScript version pinned in this package
 * (5.9), independent of the TypeScript the consuming app compiles with, so it
 * also works for apps on TypeScript 7.
 *
 * Errors are reported as warnings (only-warn); lint scripts run with
 * `--max-warnings 0`, so any finding still fails the task.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  {
    ignores: ["dist/**", "coverage/**", ".turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  eslintConfigPrettier,
];
