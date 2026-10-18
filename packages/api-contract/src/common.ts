import { z } from "zod";

/** UUID v4 identifier. */
export const IdSchema = z.uuid();

/** ISO 8601 UTC timestamp string. */
export const TimestampSchema = z.iso.datetime({ offset: true });
