import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import { Public } from "../common/decorators";
import { ErrorResponseDto } from "../common/dto/error-response.dto";
import { HealthResponseDto } from "./dto/health-response.dto";
import { HealthService } from "./health.service";

@Public()
@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness/readiness probe including a database round-trip.
   * @returns Health status wrapped in the standard success envelope.
   */
  @Get()
  @ApiOperation({ summary: "Check API and database health" })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: "Wrapped as { data: HealthResponseDto }",
  })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  public check(): Promise<HealthResponseDto> {
    return this.healthService.check();
  }
}
