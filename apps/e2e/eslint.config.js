import { config as baseConfig } from "@lmesh/eslint-config/base";

/**
 * E2E ESLint config: the shared base preset. E2E is an uncached, on-demand
 * task that reads its settings from the environment, so turbo's env hashing
 * rule does not apply.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  { ignores: ["test-results/**", "playwright-report/**", ".auth/**"] },
  ...baseConfig,
  {
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
