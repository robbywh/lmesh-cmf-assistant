import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, resolveRedirect } from "./redirect";

describe("resolveRedirect", () => {
  it.each([
    ["/projects", "/projects"],
    ["/projects/abc?x=1#h", "/projects/abc?x=1#h"],
    ["/x", "/x"],
  ])("keeps the same-origin path %j", (input, expected) => {
    expect(resolveRedirect(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [""],
    ["//evil.example"],
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["https://evil.example"],
    ["http://localhost/x"],
    ["javascript:alert(1)"],
    ["evil.example"],
    ["projects"],
  ])("falls back to the default for %j", (input) => {
    expect(resolveRedirect(input)).toBe(DEFAULT_REDIRECT);
  });
});
