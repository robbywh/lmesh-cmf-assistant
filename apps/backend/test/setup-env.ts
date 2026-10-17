import "reflect-metadata";

// Minimal env so ConfigModule validation passes when AppModule is imported in tests.
// ConfigModule.forRoot validates at import time, so this runs via Jest `setupFiles`.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-at-least-16-chars";
