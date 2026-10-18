import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvironmentVariables } from "../config/env.validation";
import {
  markStaleStreamingAsError,
  type MessageDb,
  type StaleStreamScope,
  staleStreamingCutoff,
} from "./stale-stream.util";

/** Applies the stale-stream rule with the configured AI request timeout. */
@Injectable()
export class StaleStreamService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * @param now Current time (injectable for tests).
   * @returns The instant before which a `streaming` row is stale.
   */
  public cutoff(now: Date = new Date()): Date {
    return staleStreamingCutoff(
      now,
      this.config.get("AI_REQUEST_TIMEOUT_MS", { infer: true }),
    );
  }

  /**
   * Flips stale streaming messages in `scope` to `error` / `AI_TIMEOUT`.
   * @param db Prisma client or transaction client.
   * @param scope One conversation or a whole project.
   * @returns How many rows were flipped.
   */
  public markStale(db: MessageDb, scope: StaleStreamScope): Promise<number> {
    return markStaleStreamingAsError(db, scope, this.cutoff());
  }
}
