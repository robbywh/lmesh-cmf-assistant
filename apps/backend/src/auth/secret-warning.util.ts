import type { Logger } from "@nestjs/common";

/**
 * Public example secrets (docker-compose.yml default and .env.example). Anyone
 * can read them, so a deployment using one can have its sessions forged.
 */
export const PLACEHOLDER_SECRETS: readonly string[] = [
  "change-me-in-production-0123456789abcdef",
  "replace-me-with-output-of-openssl-rand-base64-48",
];

/**
 * Logs a prominent warning when `BETTER_AUTH_SECRET` is a known public
 * placeholder. It never fails the boot: a copied `.env.example` must still work.
 * @param secret The configured secret.
 * @param logger Logger to warn with.
 * @returns True when a warning was logged.
 */
export function warnOnPlaceholderSecret(
  secret: string,
  logger: Logger,
): boolean {
  if (!PLACEHOLDER_SECRETS.includes(secret)) return false;
  logger.warn(
    "BETTER_AUTH_SECRET is a public placeholder. Anyone can forge sessions. Generate a real one with `openssl rand -base64 48` and set it in .env before exposing this app.",
  );
  return true;
}
