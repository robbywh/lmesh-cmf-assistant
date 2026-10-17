import { SetMetadata } from "@nestjs/common";

export const RAW_RESPONSE_KEY = "response:raw";

/**
 * Opts a handler out of the `{ data }` success envelope, e.g. for streamed
 * (SSE) responses that write directly to the reply.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
