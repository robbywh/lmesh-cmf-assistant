import { describe, expect, it } from "vitest";

import { parseTrustProxy } from "./trust-proxy.util";

describe("parseTrustProxy", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["true", true],
    ["false", false],
    ["", false],
    ["10.0.0.0/8, 127.0.0.1", "10.0.0.0/8, 127.0.0.1"],
  ])("parses %j", (input, expected) => {
    expect(parseTrustProxy(input)).toBe(expected);
  });
});
