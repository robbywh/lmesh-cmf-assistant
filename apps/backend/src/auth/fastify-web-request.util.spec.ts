import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { sendWebResponse, toWebRequest } from "./fastify-web-request.util";

function fakeRequest(overrides: Partial<FastifyRequest>): FastifyRequest {
  return {
    method: "POST",
    protocol: "http",
    hostname: "localhost",
    ip: "203.0.113.7",
    url: "/api/v1/auth/sign-in/email?x=1",
    headers: { host: "localhost:5173", "content-length": "99" },
    body: undefined,
    ...overrides,
  } as unknown as FastifyRequest;
}

describe("toWebRequest", () => {
  it("builds the full URL and re-serialises a parsed JSON body", async () => {
    const request = toWebRequest(
      fakeRequest({
        headers: {
          host: "localhost:5173",
          "content-type": "application/json",
          "content-length": "99",
        },
        body: { email: "a@b.c" },
      }),
    );

    expect(request.url).toBe(
      "http://localhost:5173/api/v1/auth/sign-in/email?x=1",
    );
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ email: "a@b.c" });
  });

  it("sends no body for GET and copies array headers", () => {
    const request = toWebRequest(
      fakeRequest({
        method: "GET",
        headers: { host: "localhost", cookie: "a=1" },
      }),
    );

    expect(request.body).toBeNull();
    expect(request.headers.get("cookie")).toBe("a=1");
  });
});

describe("toWebRequest bodies and headers", () => {
  it("joins a real array header into one Web header value", () => {
    const request = toWebRequest(
      fakeRequest({
        method: "GET",
        headers: { host: "localhost", "x-multi": ["a", "b"] },
      }),
    );

    expect(request.headers.get("x-multi")).toBe("a, b");
  });

  it("drops the stale content-length when the JSON body is re-serialised", async () => {
    const request = toWebRequest(
      fakeRequest({
        headers: {
          host: "localhost",
          "content-type": "application/json",
          "content-length": "9999",
        },
        body: { email: "a@b.c" },
      }),
    );

    expect(request.headers.get("content-length")).toBeNull();
    expect(await request.text()).toBe('{"email":"a@b.c"}');
  });

  it("passes a string body through unchanged", async () => {
    const request = toWebRequest(
      fakeRequest({
        headers: { host: "localhost", "content-type": "text/plain" },
        body: "plain text",
      }),
    );

    expect(await request.text()).toBe("plain text");
  });

  it("sends no body for an empty POST payload", () => {
    const withUndefined = toWebRequest(fakeRequest({ body: undefined }));
    const withNull = toWebRequest(fakeRequest({ body: null }));

    expect(withUndefined.body).toBeNull();
    expect(withNull.body).toBeNull();
  });
});

describe("toWebRequest client IP", () => {
  it("replaces a client-supplied x-real-ip and drops x-forwarded-for", () => {
    const request = toWebRequest(
      fakeRequest({
        headers: {
          host: "localhost",
          "x-real-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8",
        },
      }),
    );

    expect(request.headers.get("x-real-ip")).toBe("203.0.113.7");
    expect(request.headers.get("x-forwarded-for")).toBeNull();
  });

  it("sets x-real-ip from request.ip when the client sent none", () => {
    const request = toWebRequest(fakeRequest({}));

    expect(request.headers.get("x-real-ip")).toBe("203.0.113.7");
  });
});

describe("sendWebResponse", () => {
  it("relays status, body and multiple Set-Cookie headers", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "a=1; HttpOnly");
    headers.append("set-cookie", "b=2; HttpOnly");
    const reply = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await sendWebResponse(
      new Response('{"ok":true}', { status: 201, headers }),
      reply as unknown as FastifyReply,
    );

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.header).toHaveBeenCalledWith("set-cookie", [
      "a=1; HttpOnly",
      "b=2; HttpOnly",
    ]);
    expect(reply.header).toHaveBeenCalledWith(
      "content-type",
      "application/json",
    );
    expect(reply.send).toHaveBeenCalledWith(Buffer.from('{"ok":true}'));
  });
});
