import { config } from "@repo/eslint-config/react-internal";
import globals from "globals";

/**
 * The shared config parses TypeScript with Babel, which has no type
 * information. typescript-eslint is not used because it does not support
 * TypeScript 7 yet. Undefined and unused identifiers are left to `tsc`
 * (strict, noUnusedLocals, noUnusedParameters).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  {
    ignores: ["dist/**", "src/routeTree.gen.ts", ".agents/**"],
  },
  ...config,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    rules: {
      // Vite built-ins on import.meta.env, not user-provided env vars.
      "turbo/no-undeclared-env-vars": [
        "warn",
        { allowList: ["^DEV$", "^PROD$", "^MODE$", "^SSR$", "^BASE_URL$"] },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parserOptions: {
        babelOptions: {
          parserOpts: { plugins: ["jsx"] },
        },
      },
    },
  },
  {
    files: ["*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
