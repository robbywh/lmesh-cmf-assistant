import globals from "globals";
import tseslint from "typescript-eslint";

import { config as baseConfig } from "./base.js";
import { config as vitestConfig, testFiles } from "./vitest.js";

/**
 * NestJS (Node, CommonJS) config: the base plus typescript-eslint's
 * type-checked rules via the project service.
 *
 * The consuming app must set `tsconfigRootDir` (paths in this file resolve to
 * packages/eslint-config, not the app):
 *
 *   export default [
 *     ...config,
 *     { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
 *   ];
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // Nest relies on constructor parameter properties for DI, so only
      // methods/accessors need an explicit modifier.
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          accessibility: "explicit",
          overrides: {
            constructors: "no-public",
            properties: "off",
            parameterProperties: "off",
          },
        },
      ],
    },
  },
  {
    // Plain JS files (eslint.config.mjs etc.) are not part of a tsconfig.
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  ...vitestConfig,
  {
    files: testFiles,
    rules: {
      // `expect(mock.method).toHaveBeenCalled()` passes unbound methods by design.
      "@typescript-eslint/unbound-method": "off",
    },
  },
];
