import { ErrorCode } from "@lmesh/api-contract";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-error";
import { createQueryClient } from "./query-client";

const unauthorized = () => new ApiError(401, ErrorCode.UNAUTHORIZED, "Authentication required");

describe("createQueryClient retry policy", () => {
  it.each([
    [401, ErrorCode.UNAUTHORIZED],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.STREAM_IN_PROGRESS],
  ])("does not retry a %i", async (status, code) => {
    const client = createQueryClient();
    const queryFn = vi.fn().mockRejectedValue(new ApiError(status, code, "nope"));

    await client.fetchQuery({ queryKey: ["x"], queryFn, retryDelay: 0 }).catch(() => undefined);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx or network failure up to the configured count", async () => {
    const client = createQueryClient({ retry: 2 });
    const queryFn = vi.fn().mockRejectedValue(ApiError.internal("down", 500));

    await client.fetchQuery({ queryKey: ["x"], queryFn, retryDelay: 0 }).catch(() => undefined);

    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("never retries when retry is false", async () => {
    const client = createQueryClient({ retry: false });
    const queryFn = vi.fn().mockRejectedValue(ApiError.internal("down", 500));

    await client.fetchQuery({ queryKey: ["x"], queryFn, retryDelay: 0 }).catch(() => undefined);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});

describe("createQueryClient 401 handling", () => {
  it("clears the cache and calls onUnauthorized for a 401 query", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });
    client.setQueryData(["keep"], "value");

    await client
      .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(unauthorized()) })
      .catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["keep"])).toBeUndefined();
  });

  it("handles a 401 from a mutation too", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(unauthorized()) })
      .execute(undefined)
      .catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("ignores non-401 errors", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });

    await client
      .fetchQuery({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new ApiError(404, ErrorCode.NOT_FOUND, "missing")),
      })
      .catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("calls onUnauthorized once for concurrent 401s until the redirect settles", async () => {
    let finishRedirect: () => void = () => undefined;
    const onUnauthorized = vi.fn(
      () => new Promise<void>((resolve) => (finishRedirect = resolve)),
    );
    const client = createQueryClient({ onUnauthorized });
    const failing = (key: string) =>
      client
        .fetchQuery({ queryKey: [key], queryFn: () => Promise.reject(unauthorized()) })
        .catch(() => undefined);

    await Promise.all([failing("a"), failing("b")]);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    finishRedirect();
    await Promise.resolve();
    await Promise.resolve();
    await failing("c");
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});
