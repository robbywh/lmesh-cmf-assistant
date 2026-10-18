import globals from "globals";

/** Files treated as tests (unit specs, e2e specs and test helpers). */
export const testFiles = [
  "**/*.{spec,test}.{ts,tsx,mts,cts,js,jsx}",
  "**/test/**/*.{ts,tsx,mts,cts,js,jsx}",
];

/**
 * Overrides for Vitest test files. Tests import `describe`/`it`/`expect`/`vi`
 * explicitly from "vitest"; the globals are declared only so plain-JS tests do
 * not trip `no-undef`. There are no Jest globals anywhere in the repo.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  {
    files: testFiles,
    languageOptions: {
      globals: globals.vitest,
    },
    rules: {
      // Tests stub env vars directly; runtime config is validated by the app.
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
