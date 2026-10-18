import "reflect-metadata";

// Minimal env so ConfigModule validation passes when AppModule is imported in tests.
// ConfigModule.forRoot validates at import time, so this runs via Vitest `setupFiles`.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";

// Pin the values the stale-stream threshold and the history window depend on, so a developer's
// root .env (loaded by ConfigModule, but never over real env vars) cannot change test behaviour.
process.env.AI_REQUEST_TIMEOUT_MS = "120000";
process.env.AI_FIRST_TOKEN_TIMEOUT_MS = "30000";
process.env.AI_HISTORY_MAX_MESSAGES = "20";
process.env.AI_HISTORY_MAX_CHARS = "24000";
process.env.AI_FAULT_INJECTION = "false";
