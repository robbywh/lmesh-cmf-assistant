import { z } from "zod";

import { IdSchema, TimestampSchema } from "./common.js";
import { PROJECT_DESCRIPTION_MAX, PROJECT_TITLE_MAX } from "./limits.js";

const TitleSchema = z.string().trim().min(1).max(PROJECT_TITLE_MAX);

/**
 * Optional design context. Trimmed; the backend stores an empty string as
 * `null`.
 */
const DescriptionSchema = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX)
  .nullable();

export const ProjectIdParamsSchema = z.object({ projectId: IdSchema });
export type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  title: z.string(),
  description: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

/** Body of `POST /api/v1/projects`. */
export const CreateProjectRequestSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema.optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/** Body of `PATCH /api/v1/projects/:projectId`; at least one field. */
export const UpdateProjectRequestSchema = z
  .object({
    title: TitleSchema.optional(),
    description: DescriptionSchema.optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.description !== undefined,
    { message: "Provide at least one of title or description" },
  );
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

/** `data` of `GET /api/v1/projects`, sorted by `updatedAt` descending. */
export const ProjectListSchema = z.array(ProjectSchema);
export type ProjectList = z.infer<typeof ProjectListSchema>;
