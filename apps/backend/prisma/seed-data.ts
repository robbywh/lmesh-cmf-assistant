import type { PrismaClient } from "../src/generated/prisma/client";

/** Fixed ids so the seed can tell whether a sample project already exists. */
export const SAMPLE_PROJECT_IDS = {
  suv: "5eed0001-0000-4000-8000-000000000001",
  ev: "5eed0001-0000-4000-8000-000000000002",
  coupe: "5eed0001-0000-4000-8000-000000000003",
} as const;

export const SAMPLE_CONVERSATION_IDS = {
  suv: "5eed0002-0000-4000-8000-000000000001",
  ev: "5eed0002-0000-4000-8000-000000000002",
  coupe: "5eed0002-0000-4000-8000-000000000003",
} as const;

export const SAMPLE_MESSAGE_IDS = [
  "5eed0003-0000-4000-8000-000000000001",
  "5eed0003-0000-4000-8000-000000000002",
  "5eed0003-0000-4000-8000-000000000003",
  "5eed0003-0000-4000-8000-000000000004",
  "5eed0003-0000-4000-8000-000000000005",
] as const;

interface SampleMessage {
  id: string;
  role: "user" | "assistant";
  kind: "chat" | "summary";
  content: string;
}

const SUV_MESSAGES: SampleMessage[] = [
  {
    id: SAMPLE_MESSAGE_IDS[0],
    role: "user",
    kind: "chat",
    content:
      "For the warm-earth SUV interior, what leather and wood options would fit a calm, natural, crafted feel?",
  },
  {
    id: SAMPLE_MESSAGE_IDS[1],
    role: "assistant",
    kind: "chat",
    content: `Here are three directions that suit a warm, crafted brief:

1. **Vegetable-tanned leather in cognac or saddle.** It develops a natural patina and feels authentic. *Trade-off:* it marks and fades more easily, so it needs a protective topcoat in high-wear areas.
2. **Chrome-free tanned leather in sand or clay.** Softer, lighter and kinder to the environment, and it keeps the cabin airy. *Trade-off:* lighter shades show dirt sooner.
3. **Open-pore walnut or oak trim.** The visible grain reads as honest and tactile. *Trade-off:* open pores are less scratch-resistant than lacquered wood and need a satin sealer.

For the wood, I would pair either leather with open-pore oak for a lighter cabin, or walnut if you want more contrast.`,
  },
  {
    id: SAMPLE_MESSAGE_IDS[2],
    role: "user",
    kind: "chat",
    content:
      "Let's go with chrome-free sand leather and open-pore oak. What finishes would you suggest for both?",
  },
  {
    id: SAMPLE_MESSAGE_IDS[3],
    role: "assistant",
    kind: "chat",
    content: `Good pairing. For finishes I would suggest:

- **Leather:** a matte, low-gloss topcoat with a fine natural grain emboss. It keeps the surface calm and hides small marks. Keep contrast stitching tone-on-tone (slightly darker sand) to stay subtle.
- **Oak:** an ultra-matte, water-based sealer so the pores stay open. Avoid any visible gloss; satin at most.
- **Metal accents:** brushed bronze or champagne rather than chrome, to echo the warm palette.

Next step could be to check how the sand leather looks next to the oak under warm and cool cabin lighting.`,
  },
  {
    id: SAMPLE_MESSAGE_IDS[4],
    role: "assistant",
    kind: "summary",
    content: `## Design direction
A calm, natural and crafted premium SUV cabin built on warm earth tones.

## Colours
Sand and clay base tones, with brushed bronze or champagne accents.

## Materials
- Chrome-free tanned leather in sand
- Open-pore oak trim

## Finishes
- Leather: matte, low-gloss topcoat with a fine natural grain emboss, tone-on-tone stitching
- Oak: ultra-matte water-based sealer, pores left open
- Metal: brushed bronze or champagne instead of chrome

## Open questions / next steps
- Check the sand leather against the oak under warm and cool cabin lighting
- Decide whether any darker contrast element is needed`,
  },
];

const MINUTE_MS = 60_000;

/**
 * Creates the three sample projects for a user if they do not exist yet.
 * A project that already exists (by fixed id) is left completely untouched, so
 * user edits and resets survive restarts. A deleted sample project is recreated.
 * Project 1 is newest, so it sorts first in the sidebar.
 * @param prisma Prisma client to write with.
 * @param ownerEmail Email of the user who owns the samples.
 * @param now Reference time (injectable for tests).
 * @returns How many projects were created.
 */
export async function seedSampleProjects(
  prisma: PrismaClient,
  ownerEmail: string,
  now: Date = new Date(),
): Promise<number> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: ownerEmail },
  });
  const at = (minutesAgo: number): Date =>
    new Date(now.getTime() - minutesAgo * MINUTE_MS);

  const samples = [
    {
      key: "coupe",
      title: "Sports coupe: dark technical",
      description:
        "Dark technical cockpit, carbon and Alcantara, satin metal accents.",
      updatedAt: at(120),
      messages: [] as SampleMessage[],
    },
    {
      key: "ev",
      title: "Urban EV compact: recycled textiles",
      description:
        "Bright, youthful city car. Recycled and bio-based textiles, light greys with one accent colour.",
      updatedAt: at(60),
      messages: [] as SampleMessage[],
    },
    {
      key: "suv",
      title: "Premium SUV interior: warm earth",
      description:
        "Warm earth tones, matte leather, premium SUV interior. Calm, natural, crafted feel.",
      updatedAt: at(0),
      messages: SUV_MESSAGES,
    },
  ] as const;

  let created = 0;
  for (const sample of samples) {
    const exists = await prisma.project.findUnique({
      where: { id: SAMPLE_PROJECT_IDS[sample.key] },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.project.create({
      data: {
        id: SAMPLE_PROJECT_IDS[sample.key],
        ownerId: owner.id,
        title: sample.title,
        description: sample.description,
        createdAt: sample.updatedAt,
        updatedAt: sample.updatedAt,
        conversations: {
          create: {
            id: SAMPLE_CONVERSATION_IDS[sample.key],
            createdAt: at(30),
            messages: {
              create: sample.messages.map((message, index) => ({
                ...message,
                status: "complete" as const,
                createdAt: at(20 - index * 2),
                updatedAt: at(20 - index * 2),
              })),
            },
          },
        },
      },
    });
    created += 1;
  }
  return created;
}
