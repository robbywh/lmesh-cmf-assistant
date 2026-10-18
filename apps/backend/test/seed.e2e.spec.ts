import {
  ActiveConversationSchema,
  type ActiveConversation,
} from "@lmesh/api-contract";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SAMPLE_PROJECT_IDS, seedSampleProjects } from "../prisma/seed-data";
import { SEED_USER, seedUser } from "../prisma/seed-user";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createTestApp, signInCookie } from "./support/create-test-app";

const SAMPLE_IDS = Object.values(SAMPLE_PROJECT_IDS);

// The only spec that uses the seed user. No other spec may rely on that user's projects.
describe("seed (e2e, real Postgres)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  const reseed = async (): Promise<number> =>
    seedSampleProjects(prisma, await seedUser(prisma));

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp());
    await prisma.project.deleteMany({ where: { id: { in: SAMPLE_IDS } } });
    await reseed();
    await reseed();
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  const get = async (url: string) =>
    app.inject({
      method: "GET",
      url: `/api/v1${url}`,
      headers: {
        cookie: await signInCookie(app, SEED_USER.email, SEED_USER.password),
      },
    });

  it("yields exactly 3 sample projects and 5 messages after seeding twice", async () => {
    const projects = await prisma.project.count({
      where: { id: { in: SAMPLE_IDS } },
    });
    const messages = await prisma.message.count({
      where: { conversation: { projectId: { in: SAMPLE_IDS } } },
    });
    const conversations = await prisma.conversation.count({
      where: { projectId: { in: SAMPLE_IDS }, archivedAt: null },
    });

    expect({ projects, messages, conversations }).toEqual({
      projects: 3,
      messages: 5,
      conversations: 3,
    });
    expect(await reseed()).toBe(0);
  });

  it("lists the premium SUV project first", async () => {
    const response = await get("/projects");

    expect(response.statusCode).toBe(200);
    const ids = response
      .json<{ data: { id: string }[] }>()
      .data.map((project) => project.id)
      .filter((id) => SAMPLE_IDS.includes(id as never));
    expect(ids).toEqual([
      SAMPLE_PROJECT_IDS.suv,
      SAMPLE_PROJECT_IDS.ev,
      SAMPLE_PROJECT_IDS.coupe,
    ]);
  });

  it("returns project 1's five messages in order, valid against the contract", async () => {
    const response = await get(
      `/projects/${SAMPLE_PROJECT_IDS.suv}/conversations/active`,
    );

    expect(response.statusCode).toBe(200);
    const { data } = response.json<{ data: ActiveConversation }>();
    expect(() => ActiveConversationSchema.parse(data)).not.toThrow();
    expect(data.messages.map((m) => `${m.role}:${m.kind}`)).toEqual([
      "user:chat",
      "assistant:chat",
      "user:chat",
      "assistant:chat",
      "assistant:summary",
    ]);
    expect(data.messages.every((m) => m.status === "complete")).toBe(true);
    expect(data.messages[4]?.content).toContain("## Design direction");
  });

  it("does not overwrite an edited sample project on re-seed", async () => {
    await prisma.project.update({
      where: { id: SAMPLE_PROJECT_IDS.ev },
      data: { title: "My own title", description: null },
    });
    await prisma.conversation.updateMany({
      where: { projectId: SAMPLE_PROJECT_IDS.suv, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    await reseed();

    const edited = await prisma.project.findUniqueOrThrow({
      where: { id: SAMPLE_PROJECT_IDS.ev },
    });
    expect(edited).toMatchObject({ title: "My own title", description: null });
    expect(
      await prisma.conversation.count({
        where: { projectId: SAMPLE_PROJECT_IDS.suv, archivedAt: null },
      }),
    ).toBe(0);
  });
});
