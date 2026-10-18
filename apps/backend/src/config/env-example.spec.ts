import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getMetadataStorage } from "class-validator";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_SECRETS } from "../auth/secret-warning.util";
import { EnvironmentVariables } from "./env.validation";

const ROOT = resolve(__dirname, "../../../..");
const read = (file: string): string =>
  readFileSync(resolve(ROOT, file), "utf8");

/** Keys documented in .env.example, including commented-out optional ones (`# KEY=value`). */
function exampleKeys(): string[] {
  return [...read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(
    (match) => match[1]!,
  );
}

const schemaKeys = (): string[] => [
  ...new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(EnvironmentVariables, "", false, false)
      .map((metadata) => metadata.propertyName),
  ),
];

describe(".env.example parity", () => {
  it("documents every variable the backend reads (EnvironmentVariables)", () => {
    const documented = new Set(exampleKeys());

    const missing = schemaKeys().filter((key) => !documented.has(key));

    expect(missing).toEqual([]);
  });

  it("has nothing stale: every other key is consumed by docker-compose.yml", () => {
    const compose = read("docker-compose.yml");
    const schema = new Set(schemaKeys());

    const stale = exampleKeys().filter(
      (key) => !schema.has(key) && !new RegExp(`\\b${key}\\b`).test(compose),
    );

    expect(stale).toEqual([]);
  });

  it("lists the public placeholder secrets that trigger the startup warning", () => {
    const example = /^BETTER_AUTH_SECRET=(.+)$/m.exec(
      read(".env.example"),
    )?.[1];
    const composeDefault =
      /BETTER_AUTH_SECRET: \$\{BETTER_AUTH_SECRET:-([^}]+)\}/.exec(
        read("docker-compose.yml"),
      )?.[1];

    expect(PLACEHOLDER_SECRETS).toContain(example);
    expect(PLACEHOLDER_SECRETS).toContain(composeDefault);
  });
});
