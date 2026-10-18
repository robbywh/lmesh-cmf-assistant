import { createAuthClient } from "better-auth/react";

import { apiBaseUrl } from "@/lib/env";

/** better-auth client; `/auth/*` answers with raw better-auth shapes, not API envelopes. */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: `${apiBaseUrl}/auth`,
  // Resolve the global at call time so test servers that patch `fetch` after import still apply.
  fetchOptions: { customFetchImpl: (...args) => fetch(...args) },
});
