import { type SseEvent, SseEventSchema } from "@lmesh/api-contract";

/**
 * Parses a full `text/event-stream` body into contract-validated events.
 * Comment frames (`: ping`) are skipped.
 */
export function parseSseBody(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .filter((frame) => frame.startsWith("event:"))
    .map((frame) => {
      const lines = frame.split("\n");
      const name = lines[0]!.slice("event: ".length);
      const data = JSON.parse(
        lines.find((line) => line.startsWith("data: "))!.slice("data: ".length),
      ) as unknown;
      const event = SseEventSchema.parse(data);
      if (event.type !== name) {
        throw new Error(`event name ${name} does not match type ${event.type}`);
      }
      return event;
    });
}
