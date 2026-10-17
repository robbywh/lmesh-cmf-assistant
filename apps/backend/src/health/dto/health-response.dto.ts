import { ApiProperty } from "@nestjs/swagger";

/** Payload returned by `GET /api/v1/health`. */
export class HealthResponseDto {
  @ApiProperty({ example: "ok" })
  status!: "ok";

  @ApiProperty({ example: "up" })
  database!: "up";

  @ApiProperty({ example: 12.34, description: "Process uptime in seconds" })
  uptime!: number;

  @ApiProperty({ example: "2026-01-01T00:00:00.000Z" })
  timestamp!: string;
}
