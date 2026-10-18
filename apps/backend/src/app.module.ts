import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { OriginGuard } from "./common/guards/origin.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { ChatModule } from "./chat/chat.module";
import { AuthModule } from "./auth/auth.module";
import { SessionGuard } from "./auth/session.guard";
import { ZodRequestValidationPipe } from "./common/pipes/zod-validation.pipe";
import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { ProjectsModule } from "./projects/projects.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // App-local .env wins over the monorepo root .env; real env vars win over both.
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    ConversationsModule,
    ChatModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_PIPE, useClass: ZodRequestValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
