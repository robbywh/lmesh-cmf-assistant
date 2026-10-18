const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "short" });

/**
 * Short relative time such as "5 min. ago" or "3 days ago".
 * @param iso ISO 8601 timestamp.
 * @param now Reference time in ms (injectable for tests).
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  for (const [unit, unitSeconds] of UNITS) {
    if (seconds >= unitSeconds) return formatter.format(-Math.floor(seconds / unitSeconds), unit);
  }
  return "just now";
}
