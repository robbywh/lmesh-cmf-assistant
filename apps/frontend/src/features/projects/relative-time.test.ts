import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

const now = Date.parse("2026-01-10T12:00:00.000Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe("formatRelativeTime", () => {
  it("shows 'just now' under a minute and for future timestamps", () => {
    expect(formatRelativeTime(ago(20), now)).toBe("just now");
    expect(formatRelativeTime(ago(-30), now)).toBe("just now");
  });

  it("uses minutes, hours and days", () => {
    expect(formatRelativeTime(ago(5 * 60), now)).toMatch(/^5 min\.? ago$/);
    expect(formatRelativeTime(ago(3 * 3600), now)).toMatch(/^3 hr\.? ago$/);
    expect(formatRelativeTime(ago(2 * 86_400), now)).toMatch(/^2 days ago$/);
  });
});
