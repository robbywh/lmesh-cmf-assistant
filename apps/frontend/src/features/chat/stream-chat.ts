import {
  buildPath,
  endpoints,
  SseEventSchema,
  SseEventType,
  type EndpointName,
  type SseEvent,
} from "@lmesh/api-contract";

import { ApiError, apiErrorFromResponse } from "@/lib/api-error";
import { apiBaseUrl } from "@/lib/env";

import { readSseRecords, type SseRecord } from "./sse-reader";

export type StreamEndpoint = Extract<EndpointName, "sendMessage" | "summarise" | "retryMessage">;

export interface StreamChatOptions {
  params: Record<string, string>;
  /** JSON request body (`sendMessage` only). */
  body?: unknown;
  signal?: AbortSignal;
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set(Object.values(SseEventType));

function parsePayload(record: SseRecord): SseEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(record.data);
  } catch {
    throw ApiError.internal("Malformed stream event");
  }
  const parsed = SseEventSchema.safeParse(payload);
  if (!parsed.success || parsed.data.type !== record.event) {
    throw ApiError.internal("Invalid stream event payload");
  }
  return parsed.data;
}

async function* parseEvents(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
): AsyncGenerator<SseEvent> {
  try {
    for await (const record of readSseRecords(stream)) {
      // Unknown event names are skipped.
      if (KNOWN_EVENTS.has(record.event)) yield parsePayload(record);
    }
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw ApiError.internal("Stream connection lost");
  }
}

/**
 * Starts a streaming chat request and returns the validated event iterator.
 * @param endpoint One of the contract's streaming endpoints.
 * @param options Path params, optional JSON body and an abort signal.
 * @returns An async iterator of `SseEvent`s in server order.
 * @throws ApiError for pre-stream JSON errors (before any event), an invalid
 *   payload or a lost connection; the original AbortError when `signal` aborts.
 */
export async function streamChat(
  endpoint: StreamEndpoint,
  { params, body, signal }: StreamChatOptions,
): Promise<AsyncGenerator<SseEvent>> {
  const { method, path } = endpoints[endpoint];
  const headers: Record<string, string> = { Accept: "text/event-stream" };
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
  if (!response.body) throw ApiError.internal("Empty stream response", response.status);
  return parseEvents(response.body, signal);
}
