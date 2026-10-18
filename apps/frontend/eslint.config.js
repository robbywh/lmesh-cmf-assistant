import { config } from "@lmesh/eslint-config/react";

/**
 * Frontend ESLint config: the shared React + Vite preset.
 *
 * Linting is syntax-only (no type-aware rules): typescript-eslint parses with
 * the TypeScript 5.9 pinned in @lmesh/eslint-config because it cannot load
 * TypeScript 7, which this app compiles with. Type errors, undefined and
 * unused identifiers are left to `tsc` (strict, noUnusedLocals,
 * noUnusedParameters).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  {
    ignores: ["dist/**", "src/routeTree.gen.ts", ".agents/**", "public/mockServiceWorker.js"],
  },
  ...config,
  {
    // TanStack Router file routes export `Route` and keep the route component
    // private. With `autoCodeSplitting` (vite.config.ts) the router plugin moves
    // the component into its own module, so Fast Refresh boundaries are
    // preserved and this rule only reports false positives here.
    files: ["src/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // shadcn/ui components are generated and co-export their cva variants
    // (e.g. buttonVariants); editing them falls back to a full reload, which
    // is acceptable for vendored primitives.
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
