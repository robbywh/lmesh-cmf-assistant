import { describe, expect, it } from "vitest";

import { isSwaggerEnabled, sessionCookieName } from "./setup-app.util";

describe("sessionCookieName", () => {
  it("follows the cookie better-auth issues: __Secure- prefix only under https", () => {
    expect(sessionCookieName("http://localhost:5173")).toBe(
      "better-auth.session_token",
    );
    expect(sessionCookieName("https://app.example.com")).toBe(
      "__Secure-better-auth.session_token",
    );
  });
});

describe("isSwaggerEnabled", () => {
  it.each([
    ["development", false, true],
    ["test", false, true],
    ["production", false, false],
    ["production", true, true],
  ])("NODE_ENV=%s SWAGGER_ENABLED=%s gives %s", (env, flag, expected) => {
    expect(isSwaggerEnabled(env, flag)).toBe(expected);
  });
});
