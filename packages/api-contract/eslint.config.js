import { config as baseConfig } from "@lmesh/eslint-config/base";
import { config as vitestConfig } from "@lmesh/eslint-config/vitest";

/**
 * API contract ESLint config: the shared base preset plus Vitest overrides.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [...baseConfig, ...vitestConfig];
