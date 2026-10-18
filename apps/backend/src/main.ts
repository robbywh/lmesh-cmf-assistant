import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import type { EnvironmentVariables } from "./config/env.validation";
import {
  DEFAULT_TRUST_PROXY,
  parseTrustProxy,
} from "./config/trust-proxy.util";
import {
  isSwaggerEnabled,
  sessionCookieName,
  setupApp,
  setupSwagger,
} from "./setup-app.util";

async function bootstrap(): Promise<void> {
  // Needed before the app (and its ConfigService) exists; validated as a string in env.validation.ts.
  const trustProxy = parseTrustProxy(
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.TRUST_PROXY ?? DEFAULT_TRUST_PROXY,
  );
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy }),
  );
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  setupApp(app, config.get("CORS_ORIGIN", { infer: true }));
  const swaggerOn = isSwaggerEnabled(
    config.get("NODE_ENV", { infer: true }),
    config.get("SWAGGER_ENABLED", { infer: true }),
  );
  if (swaggerOn) {
    setupSwagger(
      app,
      sessionCookieName(config.get("BETTER_AUTH_URL", { infer: true })),
    );
  }

  const port = config.get("PORT", { infer: true });
  const host = config.get("HOST", { infer: true });
  await app.listen(port, host);

  const logger = new Logger(bootstrap.name);
  logger.log(`API listening on http://${host}:${port}/api/v1`);
  if (swaggerOn) {
    logger.log(`Swagger docs at http://${host}:${port}/api/docs`);
  }
}

void bootstrap();
