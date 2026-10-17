import { Injectable, Logger } from "@nestjs/common";

import { ErrorCode, ServiceUnavailableException } from "../common/exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { HealthResponseDto } from "./dto/health-response.dto";

/** Reports liveness of the API and its database. */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs a trivial query against the database.
   * @returns Health status when the database is reachable.
   * @throws ServiceUnavailableException when the database query fails.
   */
  public async check(): Promise<HealthResponseDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "Database is unavailable",
        ErrorCode.DATABASE_UNAVAILABLE,
        error,
      );
    }

    return {
      status: "ok",
      database: "up",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
