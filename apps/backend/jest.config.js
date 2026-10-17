// Run via `pnpm test`: Jest needs --experimental-vm-modules to require() ESM-only
// dependencies (e.g. `cookie` pulled in by Fastify's inject()).
/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  moduleFileExtensions: ["js", "json", "ts"],
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  // The generated Prisma client imports siblings as `./x.js`; map them back to the .ts sources.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/generated/**", "!src/main.ts"],
  coverageDirectory: "coverage",
};
