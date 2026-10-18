import type { ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import type { EnvironmentVariables } from "../../config/env.validation";
import { ForbiddenException } from "../exceptions";
import { OriginGuard } from "./origin.guard";

const config = {
  get: (key: string) =>
    ({
      CORS_ORIGIN: "http://localhost:5173, https://app.example.com",
      BETTER_AUTH_URL: "http://localhost:8080",
    })[key],
} as unknown as ConfigService<EnvironmentVariables, true>;

const run = (method: string, origin?: string): boolean =>
  new OriginGuard(config).canActivate({
    switchToHttp: () => ({
      getRequest: () => ({ method, url: "/x", headers: { origin } }),
    }),
  } as unknown as ExecutionContext);

describe("OriginGuard", () => {
  it.each(["POST", "PATCH", "PUT", "DELETE"])(
    "rejects %s from a foreign Origin with ForbiddenException",
    (method) => {
      expect(() => run(method, "http://evil.example")).toThrow(
        ForbiddenException,
      );
    },
  );

  it.each([
    "http://localhost:5173",
    "https://app.example.com",
    "http://localhost:8080",
  ])("allows the configured origin %s", (origin) => {
    expect(run("POST", origin)).toBe(true);
  });

  it("allows requests without an Origin header", () => {
    expect(run("POST")).toBe(true);
  });

  it("never blocks safe methods", () => {
    expect(run("GET", "http://evil.example")).toBe(true);
    expect(run("HEAD", "http://evil.example")).toBe(true);
    expect(run("OPTIONS", "http://evil.example")).toBe(true);
  });

  it('rejects the opaque "null" origin', () => {
    expect(() => run("POST", "null")).toThrow(ForbiddenException);
  });
});
