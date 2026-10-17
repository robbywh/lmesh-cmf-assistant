import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import type { EnvironmentVariables } from "../config/env.validation";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Application-wide Prisma client backed by the `pg` driver adapter.
 * A single instance (and connection pool) is shared through `PrismaModule`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get("DATABASE_URL", { infer: true }),
      }),
    });
  }

  /**
   * Opens the connection pool eagerly. A failure is logged rather than
   * thrown so the API still boots and `/health` can report the outage.
   */
  public async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log("Connected to database");
    } catch (error) {
      this.logger.error(
        "Database connection failed at startup",
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** Closes the connection pool on application shutdown. */
  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
