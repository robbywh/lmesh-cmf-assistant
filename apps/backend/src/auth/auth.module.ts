import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvironmentVariables } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { createAuth } from "./auth.config";
import { AUTH } from "./auth.constants";
import { warnOnPlaceholderSecret } from "./secret-warning.util";
import { AuthHandlerController } from "./auth-handler.controller";

/** Provides the better-auth instance and mounts its HTTP handler. */
@Module({
  controllers: [AuthHandlerController],
  providers: [
    {
      provide: AUTH,
      inject: [ConfigService, PrismaService],
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
        prisma: PrismaService,
      ) => {
        const secret = config.get("BETTER_AUTH_SECRET", { infer: true });
        warnOnPlaceholderSecret(secret, new Logger(AuthModule.name));
        return createAuth({
          prisma,
          secret,
          baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
          corsOrigin: config.get("CORS_ORIGIN", { infer: true }),
        });
      },
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
