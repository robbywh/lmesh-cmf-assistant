/** Default: trust exactly one proxy hop (the nginx in front of the API). */
export const DEFAULT_TRUST_PROXY = "1";

/**
 * Parses the `TRUST_PROXY` setting into Fastify's `trustProxy` option.
 * @param value `"true"`/`"false"`, a hop count (`"1"`), or a comma-separated
 * list of trusted addresses/CIDRs.
 * @returns The value to pass to `new FastifyAdapter({ trustProxy })`.
 */
export function parseTrustProxy(value: string): boolean | number | string {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false" || trimmed === "") return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
