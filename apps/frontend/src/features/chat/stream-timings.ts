/** Defaults for the timers around streaming. Tests shorten them through {@link streamTimings}. */
export const DEFAULT_STREAM_TIMINGS = {
  /**
   * Delays between refetches after Stop. The server saves `aborted` once it
   * notices the closed connection, so early refetches may still see `streaming`.
   */
  resyncDelaysMs: [300, 1000, 2000],
  /** Extra wait before a final invalidate when the server still says `streaming` after the last resync. */
  lateInvalidateMs: 5000,
  /** Refetch period for a `streaming` row that no local stream drives (another tab, a reload). */
  orphanPollMs: 2000,
};

export const streamTimings = { ...DEFAULT_STREAM_TIMINGS };
