/**
 * Endpoint map. Paths are relative to the API base `/api/v1`; `:name`
 * segments are path parameters (see `buildPath`). `stream: true` endpoints
 * return `text/event-stream` once the stream starts (JSON error envelopes
 * before that). Auth endpoints are better-auth's own and return raw
 * better-auth responses, not envelopes.
 */
export const endpoints = {
  health: { method: "GET", path: "/health", auth: false },

  signIn: { method: "POST", path: "/auth/sign-in/email", auth: false },
  signOut: { method: "POST", path: "/auth/sign-out", auth: true },
  getSession: { method: "GET", path: "/auth/get-session", auth: false },

  listProjects: { method: "GET", path: "/projects", auth: true },
  createProject: { method: "POST", path: "/projects", auth: true },
  getProject: { method: "GET", path: "/projects/:projectId", auth: true },
  updateProject: { method: "PATCH", path: "/projects/:projectId", auth: true },
  deleteProject: { method: "DELETE", path: "/projects/:projectId", auth: true },

  getActiveConversation: {
    method: "GET",
    path: "/projects/:projectId/conversations/active",
    auth: true,
  },
  resetConversation: {
    method: "POST",
    path: "/projects/:projectId/conversations",
    auth: true,
  },

  sendMessage: {
    method: "POST",
    path: "/projects/:projectId/messages",
    auth: true,
    stream: true,
  },
  summarise: {
    method: "POST",
    path: "/projects/:projectId/summaries",
    auth: true,
    stream: true,
  },
  retryMessage: {
    method: "POST",
    path: "/messages/:messageId/retry",
    auth: true,
    stream: true,
  },
} as const;

export type EndpointName = keyof typeof endpoints;

/**
 * Fills `:name` segments of an endpoint path.
 * @param path Path template, e.g. `/projects/:projectId`.
 * @param params Values for each `:name` segment.
 * @returns The path with parameters URL-encoded.
 * @throws Error when a parameter is missing.
 */
export function buildPath(
  path: string,
  params: Record<string, string> = {},
): string {
  return path.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for ${path}`);
    }
    return encodeURIComponent(value);
  });
}
