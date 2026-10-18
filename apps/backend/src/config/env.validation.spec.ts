import { describe, expect, it } from "vitest";

import { AiProviderName, NodeEnvironment, validateEnv } from "./env.validation";

describe("validateEnv", () => {
  const required = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    BETTER_AUTH_SECRET: "a-secret-of-at-least-32-characters!!",
  };

  it("applies defaults and coerces numeric strings", () => {
    const env = validateEnv({ ...required, PORT: "4000" });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe(NodeEnvironment.Development);
    expect(env.AI_PROVIDER).toBe(AiProviderName.OpenRouter);
    expect(env.AI_REQUEST_TIMEOUT_MS).toBe(120000);
    expect(env.AI_FIRST_TOKEN_TIMEOUT_MS).toBe(30000);
    expect(env.AI_HISTORY_MAX_MESSAGES).toBe(20);
    expect(env.AI_HISTORY_MAX_CHARS).toBe(24000);
    expect(env.AI_FAULT_INJECTION).toBe(false);
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:5173");
  });

  it("rejects a missing DATABASE_URL and BETTER_AUTH_SECRET with clear messages", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL.*BETTER_AUTH_SECRET/s);
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      validateEnv({ ...required, BETTER_AUTH_SECRET: "short" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("accepts empty provider API keys so the app boots without them", () => {
    const env = validateEnv({
      ...required,
      OPENROUTER_API_KEY: "",
      GEMINI_API_KEY: "",
    });

    expect(env.OPENROUTER_API_KEY).toBe("");
  });

  it("rejects an unknown AI provider", () => {
    expect(() => validateEnv({ ...required, AI_PROVIDER: "skynet" })).toThrow(
      /AI_PROVIDER/,
    );
  });

  it("rejects AI timeouts and history limits below 1000", () => {
    expect(() =>
      validateEnv({ ...required, AI_FIRST_TOKEN_TIMEOUT_MS: "999" }),
    ).toThrow(/AI_FIRST_TOKEN_TIMEOUT_MS/);
    expect(() =>
      validateEnv({ ...required, AI_HISTORY_MAX_CHARS: "10" }),
    ).toThrow(/AI_HISTORY_MAX_CHARS/);
  });

  describe("AI_FAULT_INJECTION", () => {
    it('parses "true" and "false" strictly', () => {
      expect(
        validateEnv({ ...required, AI_FAULT_INJECTION: "true" })
          .AI_FAULT_INJECTION,
      ).toBe(true);
      expect(
        validateEnv({ ...required, AI_FAULT_INJECTION: "false" })
          .AI_FAULT_INJECTION,
      ).toBe(false);
    });

    it('rejects any other value such as "yes"', () => {
      expect(() =>
        validateEnv({ ...required, AI_FAULT_INJECTION: "yes" }),
      ).toThrow(/AI_FAULT_INJECTION must be "true" or "false"/);
    });
  });

  describe("SWAGGER_ENABLED", () => {
    it('defaults to false and parses "true"/"false" strictly', () => {
      expect(validateEnv({ ...required }).SWAGGER_ENABLED).toBe(false);
      expect(
        validateEnv({ ...required, SWAGGER_ENABLED: "true" }).SWAGGER_ENABLED,
      ).toBe(true);
      expect(() => validateEnv({ ...required, SWAGGER_ENABLED: "1" })).toThrow(
        /SWAGGER_ENABLED/,
      );
    });
  });
});
