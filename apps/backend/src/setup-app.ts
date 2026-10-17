import { VersioningType } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const API_PREFIX = "api";
export const DEFAULT_API_VERSION = "1";

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
 * Serves the OpenAPI document and Swagger UI at `/api/docs`.
 * Kept separate from `setupApp` because Swagger UI assets are served through
 * `@fastify/static`, which e2e tests do not need.
 * @param app The Fastify-backed Nest application.
 */
export function setupSwagger(app: NestFastifyApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("AI Design Brief Assistant API")
      .setDescription("Design projects and AI-assisted CMF conversations")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, document, { useGlobalPrefix: true });
}
