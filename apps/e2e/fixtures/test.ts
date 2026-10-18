import { randomUUID } from "node:crypto";

import {
  ProjectSchema,
  type CreateProjectRequest,
  type Project,
} from "@lmesh/api-contract";
import { expect, test as base } from "@playwright/test";

const DEFAULT_DESCRIPTION =
  "Colour, material and finish direction for an e2e test car.";

export interface TestProjects {
  /** Creates a uniquely named project through the API; it is deleted after the test. */
  create(overrides?: Partial<CreateProjectRequest>): Promise<Project>;
  /** Registers a project created elsewhere (e.g. through the UI) for cleanup. */
  track(projectId: string): void;
}

/** A unique, recognisable project title for the current test. */
export function uniqueTitle(label: string): string {
  return `E2E ${label} ${randomUUID().slice(0, 8)}`;
}

/**
 * `test` with a `projects` fixture. Every test works on its own projects and
 * removes them afterwards, so the seed projects are never touched.
 */
export const test = base.extend<{ projects: TestProjects }>({
  projects: async ({ page }, use, testInfo) => {
    const createdIds: string[] = [];

    await use({
      async create(overrides = {}) {
        const response = await page.request.post("/api/v1/projects", {
          data: {
            title: uniqueTitle(testInfo.title.slice(0, 40)),
            description: DEFAULT_DESCRIPTION,
            ...overrides,
          } satisfies CreateProjectRequest,
        });
        expect(response.status()).toBe(201);
        const { data } = (await response.json()) as { data: unknown };
        const project = ProjectSchema.parse(data);
        createdIds.push(project.id);
        return project;
      },
      track(projectId) {
        createdIds.push(projectId);
      },
    });

    // A test that failed mid-stream leaves a running stream: deleting then
    // returns 409 STREAM_IN_PROGRESS, so poll until the stream has ended.
    for (const projectId of createdIds) {
      await expect
        .poll(
          async () => {
            const response = await page.request.delete(
              `/api/v1/projects/${projectId}`,
            );
            return [204, 404].includes(response.status());
          },
          { timeout: 30_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe(true);
    }
  },
});

export { expect };
