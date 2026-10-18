import type { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { trustedOrigins } from "./auth.config";
import {
  PLACEHOLDER_SECRETS,
  warnOnPlaceholderSecret,
} from "./secret-warning.util";

describe("warnOnPlaceholderSecret", () => {
  it.each(PLACEHOLDER_SECRETS)(
    "warns loudly for the public placeholder %s without throwing",
    (secret) => {
      const logger = { warn: vi.fn() } as unknown as Logger;

      expect(warnOnPlaceholderSecret(secret, logger)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("openssl rand -base64 48"),
      );
    },
  );

  it("stays quiet for a real secret", () => {
    const logger = { warn: vi.fn() } as unknown as Logger;

    expect(
      warnOnPlaceholderSecret(
        "a-real-generated-secret-0123456789abcdef",
        logger,
      ),
    ).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("trustedOrigins", () => {
  it("adds the base URL origin to the CORS origins, deduplicated", () => {
    expect(
      trustedOrigins({
        corsOrigin: "http://localhost:5173, https://app.example.com",
        baseURL: "http://localhost:5173/some/path",
      }),
    ).toEqual(["http://localhost:5173", "https://app.example.com"]);
  });

  it("trusts the base URL origin even when it is not in CORS_ORIGIN", () => {
    expect(
      trustedOrigins({
        corsOrigin: "http://localhost:3000",
        baseURL: "http://localhost:8080",
      }),
    ).toEqual(["http://localhost:3000", "http://localhost:8080"]);
  });
});
