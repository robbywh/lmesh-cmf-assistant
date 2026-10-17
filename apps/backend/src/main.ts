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
import { setupApp, setupSwagger } from "./setup-app";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  setupApp(app, config.get("CORS_ORIGIN", { infer: true }));
  setupSwagger(app);

  const port = config.get("PORT", { infer: true });
  const host = config.get("HOST", { infer: true });
  await app.listen(port, host);

  const logger = new Logger("Bootstrap");
  logger.log(`API listening on http://${host}:${port}/api/v1`);
  logger.log(`Swagger docs at http://${host}:${port}/api/docs`);
}

void bootstrap();
