import { queryOptions } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-error";

import { authClient } from "./auth-client";

export const sessionQueryKey = ["auth", "session"] as const;

/** Current session (`null` when signed out), cached for a minute. */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  staleTime: 60_000,
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) throw ApiError.internal("Could not load the session", error.status);
    return data ?? null;
  },
});
