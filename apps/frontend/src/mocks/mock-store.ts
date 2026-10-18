import type { ActiveConversation, Message, Project } from "@lmesh/api-contract";

import { createSeedConversations, createSeedProjects } from "./fixtures";
import type { StreamScenario } from "./sse";

interface MockState {
  /** better-auth's cookie is not observable in jsdom, so the session is tracked here. */
  signedIn: boolean;
  projects: Project[];
  /** Active conversation per project id. */
  conversations: Map<string, ActiveConversation>;
  /** Project ids with an open mock stream (drives 409 STREAM_IN_PROGRESS). */
  openStreams: Set<string>;
  /** Scenario for the next streams; `null` means success. Fault markers win over it. */
  scenario: StreamScenario | null;
  /** Default delay between tokens. 0 in tests, slower in the browser worker. */
  tokenDelayMs: number;
}

function initialState(): MockState {
  return {
    signedIn: false,
    projects: createSeedProjects(),
    conversations: createSeedConversations(),
    openStreams: new Set(),
    scenario: null,
    tokenDelayMs: 0,
  };
}

/** In-memory backend state shared by every mock handler. Mutate through tests or handlers. */
export const mockStore: MockState = initialState();

/** Restores seed data and signed-out state. Called between tests. */
export function resetMockStore(): void {
  Object.assign(mockStore, initialState());
}

/** Marks the seed user as signed in (tests that need an authenticated session). */
export function signInMock(): void {
  mockStore.signedIn = true;
}

/** Sets the scenario used by the next send, summarise and retry streams. */
export function setStreamScenario(scenario: StreamScenario | null): void {
  mockStore.scenario = scenario;
}

export function findProject(projectId: string): Project | undefined {
  return mockStore.projects.find((project) => project.id === projectId);
}

export function findConversation(projectId: string): ActiveConversation | undefined {
  return mockStore.conversations.get(projectId);
}

/** Finds a message in any active conversation (retry addresses messages by id only). */
export function findMessage(
  messageId: string,
): { conversation: ActiveConversation; message: Message } | undefined {
  for (const conversation of mockStore.conversations.values()) {
    const message = conversation.messages.find((candidate) => candidate.id === messageId);
    if (message) return { conversation, message };
  }
  return undefined;
}

/** Replaces a message in its conversation by id. */
export function replaceMessage(conversation: ActiveConversation, message: Message): void {
  conversation.messages = conversation.messages.map((existing) =>
    existing.id === message.id ? message : existing,
  );
}

/** Bumps `updatedAt` so the project moves to the top of the list. */
export function touchProject(projectId: string): void {
  mockStore.projects = mockStore.projects.map((project) =>
    project.id === projectId ? { ...project, updatedAt: new Date().toISOString() } : project,
  );
}
