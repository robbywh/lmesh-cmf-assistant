import {
  CreateProjectRequestSchema,
  ErrorCode,
  SendMessageRequestSchema,
  UpdateProjectRequestSchema,
  endpoints,
  type ActiveConversation,
  type EndpointName,
  type ErrorEnvelope,
  type Health,
  type Message,
  type Project,
  type SseEvent,
} from "@lmesh/api-contract";
import { http, HttpResponse, type HttpResponseResolver, type PathParams } from "msw";
import type { z } from "zod";

import { apiBaseUrl } from "@/lib/env";

import {
  SEED_EMAIL,
  SEED_PASSWORD,
  buildMessage,
  seedSession,
  seedUser,
  type MockAuthSession,
  type MockAuthUser,
} from "./fixtures";
import {
  findConversation,
  findMessage,
  findProject,
  mockStore,
  replaceMessage,
  touchProject,
} from "./mock-store";
import {
  DEFAULT_CHAT_TOKENS,
  DEFAULT_SUMMARY_TOKENS,
  SSE_PING,
  createSseResponse,
  scenarioEvents,
  scenarioFromMarker,
  type StreamScenario,
  type StreamingScenario,
} from "./sse";

const methods = {
  GET: http.get,
  POST: http.post,
  PATCH: http.patch,
  DELETE: http.delete,
} as const;

/** Registers a resolver for a contract endpoint (method and path come from `endpoints`). */
export function route(name: EndpointName, resolver: HttpResponseResolver) {
  const { method, path } = endpoints[name];
  return methods[method](`${apiBaseUrl}${path}`, resolver);
}

/** Success envelope response typed by the payload. */
export function ok<T>(data: T, status = 200): Response {
  return HttpResponse.json({ data }, { status });
}

/** Error envelope response (`{ message, code, errors? }`). */
export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  errors?: ErrorEnvelope["errors"],
): Response {
  const body: ErrorEnvelope = { message, code, ...(errors ? { errors } : {}) };
  return HttpResponse.json(body, { status });
}

function param(params: PathParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : String(value ?? "");
}

function unauthorized(): Response {
  return fail(401, ErrorCode.UNAUTHORIZED, "Authentication required");
}

function notFound(what: string): Response {
  return fail(404, ErrorCode.NOT_FOUND, `${what} not found`);
}

function streamInProgress(): Response {
  return fail(409, ErrorCode.STREAM_IN_PROGRESS, "A response is already being generated");
}

async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { data: parsed.data };

  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "body";
    (errors[key] ??= []).push(issue.message);
  }
  return {
    response: fail(400, ErrorCode.VALIDATION_FAILED, "Validation failed", errors),
  };
}

const sortedProjects = (): Project[] =>
  [...mockStore.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

// ---------------------------------------------------------------- streaming

interface StreamRequest {
  projectId: string;
  conversation: ActiveConversation;
  userMessage: Message | null;
  assistantMessage: Message;
  defaultTokens: string[];
  scenario: StreamingScenario;
}

/** Opens a mock SSE stream and persists its outcome to the store (complete, error or aborted). */
function openStream(request: StreamRequest): Response {
  const { projectId, conversation, userMessage, assistantMessage, defaultTokens, scenario } =
    request;
  mockStore.openStreams.add(projectId);
  let content = "";
  let closed = false;

  const finish = (message: Message): void => {
    if (closed) return;
    closed = true;
    replaceMessage(conversation, message);
    touchProject(projectId);
    mockStore.openStreams.delete(projectId);
  };

  const apply = (event: SseEvent): void => {
    if (event.type === "token") {
      content += event.delta;
      replaceMessage(conversation, { ...assistantMessage, content });
    } else if (event.type === "done") {
      finish(event.message);
    } else if (event.type === "error") {
      finish({
        ...assistantMessage,
        content,
        status: "error",
        errorCode: event.code,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  async function* events() {
    try {
      for await (const event of scenarioEvents(scenario, {
        userMessage,
        assistantMessage,
        tokenDelayMs: mockStore.tokenDelayMs,
        defaultTokens,
      })) {
        if (event !== SSE_PING) apply(event);
        yield event;
      }
    } finally {
      mockStore.openStreams.delete(projectId);
    }
  }

  return createSseResponse(events(), {
    onCancel: () =>
      finish({
        ...assistantMessage,
        content,
        status: "aborted",
        updatedAt: new Date().toISOString(),
      }),
  });
}

/** JSON error answered before the first stream byte. */
function preStreamError(scenario: Extract<StreamScenario, { kind: "pre-stream-error" }>): Response {
  return fail(scenario.status, scenario.code, scenario.message ?? "Request failed");
}

function scenarioFor(content: string): StreamScenario {
  return scenarioFromMarker(content) ?? mockStore.scenario ?? { kind: "success" };
}

function placeholder(conversation: ActiveConversation, kind: Message["kind"]): Message {
  return buildMessage(conversation.id, {
    role: "assistant",
    kind,
    content: "",
    status: "streaming",
  });
}

// ---------------------------------------------------------------- auth

function authUserPayload(): MockAuthUser {
  return seedUser;
}

const authHandlers = [
  route("signIn", async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    if (body?.email !== SEED_EMAIL || body.password !== SEED_PASSWORD) {
      return HttpResponse.json(
        { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" },
        { status: 401 },
      );
    }
    mockStore.signedIn = true;
    return HttpResponse.json({
      redirect: false,
      token: seedSession.token,
      user: authUserPayload(),
    });
  }),
  route("signOut", () => {
    mockStore.signedIn = false;
    return HttpResponse.json({ success: true });
  }),
  route("getSession", () => {
    if (!mockStore.signedIn) return HttpResponse.json(null);
    const session: MockAuthSession = seedSession;
    return HttpResponse.json({ session, user: authUserPayload() });
  }),
];

// ---------------------------------------------------------------- domain

const healthHandlers = [
  route("health", () =>
    ok<Health>({
      status: "ok",
      database: "up",
      uptime: 1,
      timestamp: new Date().toISOString(),
    }),
  ),
];

const projectHandlers = [
  route("listProjects", () => (mockStore.signedIn ? ok(sortedProjects()) : unauthorized())),

  route("createProject", async ({ request }) => {
    if (!mockStore.signedIn) return unauthorized();
    const body = await parseBody(request, CreateProjectRequestSchema);
    if ("response" in body) return body.response;

    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: body.data.title,
      description: body.data.description ? body.data.description : null,
      createdAt: now,
      updatedAt: now,
    };
    mockStore.projects.push(project);
    mockStore.conversations.set(project.id, {
      id: crypto.randomUUID(),
      projectId: project.id,
      createdAt: now,
      messages: [],
    });
    return ok(project, 201);
  }),

  route("getProject", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const project = findProject(param(params, "projectId"));
    return project ? ok(project) : notFound("Project");
  }),

  route("updateProject", async ({ params, request }) => {
    if (!mockStore.signedIn) return unauthorized();
    const existing = findProject(param(params, "projectId"));
    if (!existing) return notFound("Project");
    const body = await parseBody(request, UpdateProjectRequestSchema);
    if ("response" in body) return body.response;

    const updated: Project = {
      ...existing,
      title: body.data.title ?? existing.title,
      description:
        body.data.description === undefined
          ? existing.description
          : body.data.description || null,
      updatedAt: new Date().toISOString(),
    };
    mockStore.projects = mockStore.projects.map((project) =>
      project.id === updated.id ? updated : project,
    );
    return ok(updated);
  }),

  route("deleteProject", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const projectId = param(params, "projectId");
    if (!findProject(projectId)) return notFound("Project");
    if (mockStore.openStreams.has(projectId)) return streamInProgress();
    mockStore.projects = mockStore.projects.filter((project) => project.id !== projectId);
    mockStore.conversations.delete(projectId);
    return new HttpResponse(null, { status: 204 });
  }),
];

const conversationHandlers = [
  route("getActiveConversation", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const conversation = findConversation(param(params, "projectId"));
    return conversation ? ok(conversation) : notFound("Project");
  }),

  route("resetConversation", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const projectId = param(params, "projectId");
    if (!findProject(projectId)) return notFound("Project");
    if (mockStore.openStreams.has(projectId)) return streamInProgress();
    const fresh: ActiveConversation = {
      id: crypto.randomUUID(),
      projectId,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    mockStore.conversations.set(projectId, fresh);
    return ok(fresh, 201);
  }),
];

const streamHandlers = [
  route("sendMessage", async ({ params, request }) => {
    if (!mockStore.signedIn) return unauthorized();
    const projectId = param(params, "projectId");
    const conversation = findConversation(projectId);
    if (!conversation || !findProject(projectId)) return notFound("Project");
    const body = await parseBody(request, SendMessageRequestSchema);
    if ("response" in body) return body.response;
    if (mockStore.openStreams.has(projectId)) return streamInProgress();

    const scenario = scenarioFor(body.data.content);
    if (scenario.kind === "pre-stream-error") return preStreamError(scenario);

    const userMessage = buildMessage(conversation.id, {
      role: "user",
      content: body.data.content,
    });
    const assistantMessage = placeholder(conversation, "chat");
    conversation.messages.push(userMessage, assistantMessage);
    return openStream({
      projectId,
      conversation,
      userMessage,
      assistantMessage,
      defaultTokens: DEFAULT_CHAT_TOKENS,
      scenario,
    });
  }),

  route("summarise", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const projectId = param(params, "projectId");
    const conversation = findConversation(projectId);
    if (!conversation || !findProject(projectId)) return notFound("Project");
    if (mockStore.openStreams.has(projectId)) return streamInProgress();
    if (!conversation.messages.some(
        (m) => m.role === "assistant" && m.kind === "chat" && m.status === "complete",
      )) {
      return fail(409, ErrorCode.NOTHING_TO_SUMMARISE, "There is nothing to summarise yet");
    }

    const scenario = scenarioFor("");
    if (scenario.kind === "pre-stream-error") return preStreamError(scenario);
    const assistantMessage = placeholder(conversation, "summary");
    conversation.messages.push(assistantMessage);
    return openStream({
      projectId,
      conversation,
      userMessage: null,
      assistantMessage,
      defaultTokens: DEFAULT_SUMMARY_TOKENS,
      scenario,
    });
  }),

  route("retryMessage", ({ params }) => {
    if (!mockStore.signedIn) return unauthorized();
    const found = findMessage(param(params, "messageId"));
    if (!found) return notFound("Message");
    const { conversation, message } = found;
    const projectId = conversation.projectId;
    if (mockStore.openStreams.has(projectId)) return streamInProgress();
    const lastAssistant = conversation.messages.findLast((m) => m.role === "assistant");
    const isRetryable =
      message.role === "assistant" &&
      lastAssistant?.id === message.id &&
      (message.status === "error" || message.status === "aborted");
    if (!isRetryable) {
      return fail(409, ErrorCode.MESSAGE_NOT_RETRYABLE, "This message cannot be retried");
    }

    const scenario = scenarioFor("");
    if (scenario.kind === "pre-stream-error") return preStreamError(scenario);
    const assistantMessage: Message = {
      ...message,
      content: "",
      status: "streaming",
      errorCode: null,
      updatedAt: new Date().toISOString(),
    };
    replaceMessage(conversation, assistantMessage);
    return openStream({
      projectId,
      conversation,
      userMessage: null,
      assistantMessage,
      defaultTokens: message.kind === "summary" ? DEFAULT_SUMMARY_TOKENS : DEFAULT_CHAT_TOKENS,
      scenario,
    });
  }),
];

/** Default handlers for every contract endpoint, backed by the in-memory mock store. */
export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...projectHandlers,
  ...conversationHandlers,
  ...streamHandlers,
];

// ---------------------------------------------------------------- per-test factories

/** `server.use(...)` helper: answers an endpoint with an error envelope. */
export function errorHandler(
  name: EndpointName,
  status: number,
  code: ErrorCode,
  message = "Request failed",
  errors?: ErrorEnvelope["errors"],
) {
  return route(name, () => fail(status, code, message, errors));
}

/** `server.use(...)` helper: simulates a network failure for an endpoint. */
export function networkErrorHandler(name: EndpointName) {
  return route(name, () => HttpResponse.error());
}
