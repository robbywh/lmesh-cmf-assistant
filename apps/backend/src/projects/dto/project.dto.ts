import {
  CreateProjectRequestSchema,
  ProjectIdParamsSchema,
  ProjectListSchema,
  ProjectSchema,
  successEnvelope,
  UpdateProjectRequestSchema,
} from "@lmesh/api-contract";
import { createZodDto } from "nestjs-zod";

export class CreateProjectDto extends createZodDto(
  CreateProjectRequestSchema,
) {}
export class UpdateProjectDto extends createZodDto(
  UpdateProjectRequestSchema,
) {}
export class ProjectIdParamsDto extends createZodDto(ProjectIdParamsSchema) {}

/** Swagger models for the `{ data }` success envelope. */
export class ProjectResponseDto extends createZodDto(
  successEnvelope(ProjectSchema),
) {}
export class ProjectListResponseDto extends createZodDto(
  successEnvelope(ProjectListSchema),
) {}
