import type { Project } from "@lmesh/api-contract";

import type { Project as ProjectRow } from "../generated/prisma/client";

/**
 * Maps a Prisma project row to the contract `Project` (ISO timestamps).
 * @param row Project row from Prisma.
 * @returns The API representation.
 */
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
