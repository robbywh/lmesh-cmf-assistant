import {
  buildPath,
  endpoints,
  successEnvelope,
  type EndpointName,
} from "@lmesh/api-contract";
import type { z } from "zod";

import { apiBaseUrl } from "./env";
import { ApiError, apiErrorFromResponse, readJson } from "./api-error";

export interface ApiRequestOptions<S extends z.ZodType | undefined = undefined> {
  /** Values for `:name` segments of the endpoint path. */
  params?: Record<string, string>;
  /** JSON request body. */
  body?: unknown;
  /** Schema for the envelope's `data`. Omit for endpoints answering 204. */
  schema?: S;
  signal?: AbortSignal;
}

/**
 * Calls a contract endpoint and returns its validated `data`.
 * @param endpoint Name of the endpoint in the contract's `endpoints` map.
 * @param options Path params, JSON body and the schema for the success `data`.
 * @returns The parsed `data`, or `undefined` for 204 responses.
 * @throws ApiError for error envelopes, malformed bodies and network failures.
 */
export async function apiRequest<S extends z.ZodType | undefined = undefined>(
  endpoint: EndpointName,
  { params, body, schema, signal }: ApiRequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.output<S> : undefined> {
  const { method, path } = endpoints[endpoint];
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${buildPath(path, params)}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw ApiError.internal("Network request failed");
  }

  if (!response.ok) throw await apiErrorFromResponse(response);
  if (response.status === 204) return undefined as never;

  if (!schema) return undefined as never;
  const parsed = successEnvelope(schema as z.ZodType).safeParse(await readJson(response));
  if (!parsed.success) {
    throw ApiError.internal("Unexpected response from server", response.status);
  }
  return parsed.data.data as never;
}
