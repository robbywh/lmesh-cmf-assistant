import { describe, expect, it } from "vitest";

import { AiProviderName, NodeEnvironment, validateEnv } from "./env.validation";

describe("validateEnv", () => {
  const required = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    JWT_SECRET: "a-secret-of-at-least-16-chars",
  };

  it("applies defaults and coerces numeric strings", () => {
    const env = validateEnv({ ...required, PORT: "4000" });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe(NodeEnvironment.Development);
    expect(env.AI_PROVIDER).toBe(AiProviderName.Ollama);
    expect(env.AI_HISTORY_MAX_MESSAGES).toBe(20);
  });

  it("rejects a missing DATABASE_URL and a short JWT_SECRET", () => {
    expect(() => validateEnv({ JWT_SECRET: "short" })).toThrow(
      /DATABASE_URL.*JWT_SECRET/s,
    );
  });

  it("rejects an unknown AI provider", () => {
    expect(() => validateEnv({ ...required, AI_PROVIDER: "skynet" })).toThrow(
      /AI_PROVIDER/,
    );
  });
});
