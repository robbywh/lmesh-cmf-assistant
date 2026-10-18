import { VersioningType } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

export const API_PREFIX = "api";
export const DEFAULT_API_VERSION = "1";
/** better-auth's session cookie (default prefix + name). */
export const SESSION_COOKIE_NAME = "better-auth.session_token";

/**
 * Applies HTTP-level configuration shared by `main.ts` and e2e tests:
 * global `/api` prefix, URI versioning (`/api/v1/...`) and CORS.
 * @param app The Fastify-backed Nest application.
 * @param corsOrigin Allowed CORS origin(s), comma-separated.
 */
export function setupApp(
  app: NestFastifyApplication,
  corsOrigin: string,
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
  app.enableCors({
    origin: corsOrigin.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
}

/**
 * The session cookie better-auth actually issues: under an https base URL it
 * gets the `__Secure-` prefix.
 * @param baseURL Public base URL of the app (`BETTER_AUTH_URL`).
 */
export function sessionCookieName(baseURL: string): string {
  return baseURL.startsWith("https://")
    ? `__Secure-${SESSION_COOKIE_NAME}`
    : SESSION_COOKIE_NAME;
}

/**
 * Swagger is mounted outside production, and in production only when
 * `SWAGGER_ENABLED=true`.
 * @param nodeEnv `NODE_ENV`.
 * @param swaggerEnabled `SWAGGER_ENABLED`.
 */
export function isSwaggerEnabled(
  nodeEnv: string,
  swaggerEnabled: boolean,
): boolean {
  return nodeEnv !== "production" || swaggerEnabled;
}

/**
 * Serves the OpenAPI document and Swagger UI at `/api/docs`.
 * Kept separate from `setupApp` because Swagger UI assets are served through
 * `@fastify/static`, which e2e tests do not need.
 * @param app The Fastify-backed Nest application.
 * @param cookieName Name of the session cookie to document (see `sessionCookieName`).
 */
export function setupSwagger(
  app: NestFastifyApplication,
  cookieName: string = SESSION_COOKIE_NAME,
): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("AI Design Brief Assistant API")
      .setDescription("Design projects and AI-assisted CMF conversations")
      .setVersion("1.0")
      .addCookieAuth(cookieName)
      .build(),
  );
  SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document), {
    useGlobalPrefix: true,
  });
}
