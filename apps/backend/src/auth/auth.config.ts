import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { PrismaClient } from "../generated/prisma/client";

const SECONDS_PER_DAY = 60 * 60 * 24;

export interface AuthOptions {
  prisma: PrismaClient;
  secret: string;
  /** Public origin of the app (cookie and redirect base). */
  baseURL: string;
  /** Comma-separated browser origins allowed to call the auth endpoints. */
  corsOrigin: string;
}

/**
 * Origins allowed to call the auth endpoints: every CORS origin plus the public
 * base URL's origin, deduplicated.
 * @param options Auth options with the CORS list and base URL.
 */
export function trustedOrigins(
  options: Pick<AuthOptions, "baseURL" | "corsOrigin">,
): string[] {
  const origins = options.corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  origins.push(new URL(options.baseURL).origin);
  return [...new Set(origins)];
}

/**
 * Builds the better-auth instance per FSD 4.1: email/password only (no
 * sign-up), 7-day sessions, explicit rate limiting and UUID ids.
 * @param options Secrets, URLs and the Prisma client.
 * @returns The configured better-auth instance.
 */
export function createAuth(options: AuthOptions) {
  const secure = options.baseURL.startsWith("https://");
  return betterAuth({
    basePath: "/api/v1/auth",
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: trustedOrigins(options),
    database: prismaAdapter(options.prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { expiresIn: 7 * SECONDS_PER_DAY, updateAge: SECONDS_PER_DAY },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      database: { generateId: "uuid" },
      // Secure follows the public URL scheme so plain-http docker/localhost keeps working.
      useSecureCookies: secure,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
