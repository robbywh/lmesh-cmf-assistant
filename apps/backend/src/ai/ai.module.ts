import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvironmentVariables } from "../config/env.validation";
import { AI_PROVIDER } from "./ai.constants";
import { AiProviderFactory } from "./ai-provider.factory";

/** Provides the swappable `AI_PROVIDER` token selected by configuration. */
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        AiProviderFactory.create(config),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
