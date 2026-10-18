import type { IncomingHttpHeaders } from "node:http";

import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Copies Node-style request headers into a Web `Headers` object.
 * @param source Headers from a Fastify (Node) request.
 * @returns Equivalent Web `Headers`.
 */
export function toWebHeaders(source: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(name, item));
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

/**
 * Converts a Fastify request into a Web `Request` for `auth.handler`.
 * Fastify has already parsed JSON bodies, so the body is re-serialised.
 * `x-real-ip` is always set from `request.ip`, never from the client.
 * @param request Incoming Fastify request.
 * @returns Equivalent Web `Request`.
 */
export function toWebRequest(request: FastifyRequest): Request {
  const host = request.headers.host ?? request.hostname;
  const url = `${request.protocol}://${host}${request.url}`;

  const headers = toWebHeaders(request.headers);
  // better-auth keys its rate limit on x-real-ip. Never trust a client-supplied
  // value: replace it with the address Fastify resolved (socket, or the proxy's
  // forwarded client when TRUST_PROXY allows it).
  headers.delete("x-forwarded-for");
  headers.set("x-real-ip", request.ip);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body =
    hasBody && request.body !== undefined && request.body !== null
      ? typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)
      : undefined;
  if (body !== undefined) headers.delete("content-length");

  return new Request(url, { method: request.method, headers, body });
}

/**
 * Writes a Web `Response` to a Fastify reply: status, every header (including
 * multiple `Set-Cookie`) and the body.
 * @param response Response produced by `auth.handler`.
 * @param reply Fastify reply to write to.
 */
export async function sendWebResponse(
  response: Response,
  reply: FastifyReply,
): Promise<void> {
  void reply.status(response.status);
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") void reply.header(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) void reply.header("set-cookie", cookies);

  const payload = Buffer.from(await response.arrayBuffer());
  await reply.send(payload.length ? payload : undefined);
}
