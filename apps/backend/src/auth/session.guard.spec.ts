import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "../common/exceptions";
import type { Auth } from "./auth.config";
import { SessionGuard } from "./session.guard";

function setup(options: { isPublic?: boolean; getSession?: () => unknown }) {
  const request: Record<string, unknown> = {
    headers: { cookie: "better-auth.session_token=abc" },
  };
  const getSession = vi.fn(
    (_args: { headers: Headers }) => options.getSession?.() ?? null,
  );
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(options.isPublic),
  } as unknown as Reflector;
  const guard = new SessionGuard(reflector, {
    api: { getSession },
  } as unknown as Auth);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, context, request, getSession };
}

describe("SessionGuard", () => {
  it("allows @Public() routes without looking up a session", async () => {
    const { guard, context, getSession } = setup({ isPublic: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a request without a session", async () => {
    const { guard, context } = setup({ getSession: () => null });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("answers 503 SERVICE_UNAVAILABLE, not 401, when the session lookup itself fails", async () => {
    const { guard, context } = setup({
      getSession: () => {
        throw new Error("db down");
      },
    });

    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).code).toBe(
      "SERVICE_UNAVAILABLE",
    );
  });

  it("attaches the session to the request and forwards the cookie", async () => {
    const session = { user: { id: "u1", email: "a@b.c" }, session: {} };
    const { guard, context, request, getSession } = setup({
      getSession: () => session,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toBe(session);
    const { headers } = getSession.mock.calls[0]![0];
    expect(headers.get("cookie")).toBe("better-auth.session_token=abc");
  });
});
