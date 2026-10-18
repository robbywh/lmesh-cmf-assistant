import type { ActiveConversation, Message, Project } from "@lmesh/api-contract";

/** Raw better-auth user shape (not part of the contract: `/auth/*` is not enveloped). */
export interface MockAuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw better-auth session shape returned by `GET /auth/get-session`. */
export interface MockAuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export const SEED_EMAIL = "test@lmesh.eu";
export const SEED_PASSWORD = "password";

export const seedUser: MockAuthUser = {
  id: "a0000000-0000-4000-8000-000000000001",
  email: SEED_EMAIL,
  name: "Test Designer",
  emailVerified: true,
  image: null,
  createdAt: "2026-01-01T09:00:00.000Z",
  updatedAt: "2026-01-01T09:00:00.000Z",
};

export const seedSession: MockAuthSession = {
  id: "a0000000-0000-4000-8000-000000000002",
  userId: seedUser.id,
  token: "mock-session-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T09:00:00.000Z",
  updatedAt: "2026-01-01T09:00:00.000Z",
};

export const SEED_PROJECT_IDS = {
  suv: "b0000000-0000-4000-8000-000000000001",
  ev: "b0000000-0000-4000-8000-000000000002",
  coupe: "b0000000-0000-4000-8000-000000000003",
} as const;

const SUV_CONVERSATION_ID = "c0000000-0000-4000-8000-000000000001";

/** The three seed projects of FSD 8.3, most recently updated first. */
export function createSeedProjects(): Project[] {
  return [
    {
      id: SEED_PROJECT_IDS.suv,
      title: "Premium SUV interior: warm earth",
      description:
        "Warm earth tones, matte leather, premium SUV interior. Calm, natural, crafted feel.",
      createdAt: "2026-01-02T09:00:00.000Z",
      updatedAt: "2026-01-02T09:30:00.000Z",
    },
    {
      id: SEED_PROJECT_IDS.ev,
      title: "Urban EV compact: recycled textiles",
      description:
        "Bright, youthful city car. Recycled and bio-based textiles, light greys with one accent colour.",
      createdAt: "2026-01-02T08:00:00.000Z",
      updatedAt: "2026-01-02T08:00:00.000Z",
    },
    {
      id: SEED_PROJECT_IDS.coupe,
      title: "Sports coupe: dark technical",
      description: "Dark technical cockpit, carbon and Alcantara, satin metal accents.",
      createdAt: "2026-01-02T07:00:00.000Z",
      updatedAt: "2026-01-02T07:00:00.000Z",
    },
  ];
}

/** Builds a complete message; override any field. */
export function buildMessage(
  conversationId: string,
  overrides: Partial<Message> & Pick<Message, "role" | "content">,
): Message {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    conversationId,
    kind: "chat",
    status: "complete",
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function seedMessage(
  index: number,
  role: Message["role"],
  content: string,
  kind: Message["kind"] = "chat",
): Message {
  const stamp = `2026-01-02T09:${String(index * 5).padStart(2, "0")}:00.000Z`;
  return {
    id: `d0000000-0000-4000-8000-00000000000${index}`,
    conversationId: SUV_CONVERSATION_ID,
    role,
    kind,
    content,
    status: "complete",
    errorCode: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Active conversations keyed by project id; only the first project has messages. */
export function createSeedConversations(): Map<string, ActiveConversation> {
  const conversations = new Map<string, ActiveConversation>();
  conversations.set(SEED_PROJECT_IDS.suv, {
    id: SUV_CONVERSATION_ID,
    projectId: SEED_PROJECT_IDS.suv,
    createdAt: "2026-01-02T09:00:00.000Z",
    messages: [
      seedMessage(1, "user", "Which leather finishes suit a warm earth interior?"),
      seedMessage(
        2,
        "assistant",
        "A matte, full-grain leather in cognac or saddle brown suits a warm earth palette. A light pebble grain keeps it crafted without looking glossy.",
      ),
      seedMessage(3, "user", "What wood trim would pair with that?"),
      seedMessage(
        4,
        "assistant",
        "Open-pore walnut or oak with a satin finish pairs well. The visible grain adds natural texture next to the leather.",
      ),
      seedMessage(
        5,
        "assistant",
        "Summary: matte cognac leather with a light pebble grain, paired with open-pore satin walnut trim.",
        "summary",
      ),
    ],
  });
  for (const id of [SEED_PROJECT_IDS.ev, SEED_PROJECT_IDS.coupe]) {
    conversations.set(id, {
      id: `c0000000-0000-4000-8000-00000000001${id.slice(-1)}`,
      projectId: id,
      createdAt: "2026-01-02T07:00:00.000Z",
      messages: [],
    });
  }
  return conversations;
}
