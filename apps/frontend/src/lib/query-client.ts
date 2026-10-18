import { ErrorCode } from "@lmesh/api-contract";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError, isApiError } from "@/lib/api-error";

export interface QueryClientOptions {
  /** Called after the cache is cleared because an API call returned 401 (FR-AUTH-09). */
  onUnauthorized?: () => void | Promise<void>;
  /** Max retries for failed queries (never for 4xx). Tests pass `false`. */
  retry?: number | false;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.code === ErrorCode.UNAUTHORIZED);
}

function isClientError(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500;
}

export function createQueryClient({ onUnauthorized, retry = 1 }: QueryClientOptions = {}): QueryClient {
  // Several in-flight requests can fail together; handle only the first until the redirect settles.
  let isHandling = false;

  function handleError(error: unknown): void {
    if (!isUnauthorized(error) || isHandling) return;
    isHandling = true;
    client.clear();
    void Promise.resolve(onUnauthorized?.()).finally(() => {
      isHandling = false;
    });
  }

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx will not succeed on a second try (401 redirects, 404 shows not-found).
        retry: (failureCount: number, error: unknown) =>
          !isClientError(error) && failureCount < (retry || 0),
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}
