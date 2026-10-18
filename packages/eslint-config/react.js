import pluginReactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";

import { config as baseConfig } from "./base.js";
import { config as vitestConfig } from "./vitest.js";

/**
 * React 19 + Vite config: the base (syntax-only typescript-eslint, so it works
 * with any TypeScript version the app compiles with), browser globals, the
 * Rules of Hooks / React Compiler checks, and Fast Refresh boundaries.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Vite built-ins on import.meta.env, not user-provided env vars.
      "turbo/no-undeclared-env-vars": [
        "warn",
        { allowList: ["^DEV$", "^PROD$", "^MODE$", "^SSR$", "^BASE_URL$"] },
      ],
    },
  },
  pluginReactHooks.configs.flat.recommended,
  {
    files: ["**/*.{jsx,tsx}"],
    ...reactRefresh.configs.vite(),
  },
  {
    // Tooling config files run in Node, not the browser.
    files: ["*.config.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...vitestConfig,
];
