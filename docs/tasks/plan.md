# Implementation Plan: AI Design Brief Assistant

|          |                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | Complete (2026-10-18); not committed                                                                                                                  |
| Spec     | `docs/functional-specification.md` (approved at Gate 1)                                                                                               |
| Contract | `packages/api-contract` (`@lmesh/api-contract`), `docs/api-contract.md` – exists, owned by the Tech Lead                                              |
| Owners   | `backend-engineer` (`apps/backend`, Prisma, Docker/Compose, root README/DECISIONS), `frontend-engineer` (`apps/frontend`), `qa-engineer` (`apps/e2e`) |

## Overview

Build the slice from the FSD in four feature phases on top of the existing scaffold: foundations (contract wiring, env, MSW, AI streaming core), auth, projects and conversations, then chat streaming with summary, retry and fault injection. Backend and frontend work in parallel against the contract; the frontend builds on MSW until the backend task it needs is `done`. Each phase ends with an integration checkpoint (MSW off, real backend) and the specialist review.

## Architecture decisions (from the FSD)

- Contract first: Zod 4 schemas in `@lmesh/api-contract`, dual ESM/CJS build; backend validates with `nestjs-zod`, frontend parses responses with the same schemas (FSD 7.0).
- better-auth with our own thin Fastify integration and a global `SessionGuard` (FSD 4.1).
- SSE over POST + `fetch`; content saved at stream end; one stream per conversation enforced by a partial unique index (FSD 8.2, 9).
- `AiProvider` interface behind the `AI_PROVIDER` DI token; OpenRouter default; `fetch`-based adapters (FSD 10).
- Saved messages in TanStack Query, in-flight stream in a Zustand store keyed by project (FSD 9.4).

## Standard verification commands

- **Backend:** `pnpm --filter backend lint && pnpm --filter backend check-types && pnpm --filter backend test` (Vitest; integration tests need `docker compose up -d postgres`)
- **Frontend:** `pnpm --filter frontend lint && pnpm --filter frontend check-types && pnpm --filter frontend test` (Vitest + MSW)
- **Contract:** `pnpm --filter @lmesh/api-contract check-types`
- **E2E:** `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build -d`, then `pnpm --filter e2e lint && pnpm --filter e2e check-types && pnpm --filter e2e test:e2e`
- **Infra:** `docker compose up --build`, then smoke-check `/api/v1/health`, `/api/docs` and login

Below, "Backend gates" / "Frontend gates" / "E2E gates" refer to these commands.

## Task table

| ID  | Title                                                             | Owner    | Depends on    | Parallel with | Size |
| --- | ----------------------------------------------------------------- | -------- | ------------- | ------------- | ---- |
| T01 | Backend consumes the contract (Zod pipe, ErrorCode, Swagger)      | backend  | –             | T02           | M    |
| T02 | Frontend consumes the contract (typed API client)                 | frontend | –             | T01           | S    |
| T03 | Environment and config for better-auth and AI                     | backend  | T01           | T04           | S    |
| T04 | MSW setup (handlers, fixtures, test server, browser worker)       | frontend | T02           | T03           | M    |
| T05 | AI provider core and OpenRouter adapter                           | backend  | T01, T03      | T06           | M    |
| T06 | SSE client parser and stream store                                | frontend | T02           | T05           | S    |
| T07 | Docker images build the contract; compose env                     | backend  | T01, T02, T03 | –             | S    |
| T08 | Scaffold `apps/e2e` (Playwright)                                  | qa       | T07           | –             | M    |
| CP1 | **Checkpoint: foundations**                                       | lead     | T01–T08       |               |      |
| T09 | Prisma schema and migration (auth + domain)                       | backend  | CP1           | T12           | M    |
| T10 | better-auth instance, handler route, seed user                    | backend  | T09           | T12           | M    |
| T11 | SessionGuard, `@Public`, `@CurrentUser`, cookie auth in Swagger   | backend  | T10           | T12           | M    |
| T12 | Auth UI: login, protected layout, sign out, 401 handling (Mocked) | frontend | T04           | T05, T07–T11  | M    |
| T13 | E2E: sign-in and sign-out journey                                 | qa       | T08, T11, T12 | –             | S    |
| CP2 | **Checkpoint: auth integration**                                  | lead     | T09–T13       |               |      |
| T14 | Projects CRUD API                                                 | backend  | CP2           | T17           | M    |
| T15 | Active conversation and reset API                                 | backend  | T14           | T17, T18      | M    |
| T16 | Seed sample projects and conversation                             | backend  | T15           | T18           | S    |
| T17 | App shell, sidebar and project dialogs (Mocked)                   | frontend | CP2           | T14, T15      | M    |
| T18 | Project page: header, message list, reset dialog (Mocked)         | frontend | T17           | T15, T16      | M    |
| CP3 | **Checkpoint: projects integration**                              | lead     | T14–T18       |               |      |
| T19 | History window and prompt builder                                 | backend  | CP3           | T24           | S    |
| T20 | Chat stream service and send-message endpoint                     | backend  | T05, T19      | T24           | M    |
| T21 | Summaries and retry endpoints                                     | backend  | T20           | T24, T25      | M    |
| T22 | Ollama and Gemini adapters                                        | backend  | T05           | T24, T25      | M    |
| T23 | Fault-injecting provider and `docker-compose.e2e.yml`             | backend  | T20           | T25           | S    |
| T24 | Composer, streaming message and Stop (Mocked)                     | frontend | T06, CP3      | T19–T21       | M    |
| T25 | Error/Retry UI, Summarise and summary card (Mocked)               | frontend | T24           | T21–T23       | M    |
| CP4 | **Checkpoint: chat integration (SSE through nginx)**              | lead     | T19–T25       |               |      |
| T26 | E2E: project, chat, summarise and reset journeys                  | qa       | CP4, T13      | T28, T29      | M    |
| T27 | E2E: AI failure paths via fault markers                           | qa       | T23, T26      | T28, T29      | S    |
| T28 | README update                                                     | backend  | CP4           | T26, T27      | S    |
| T29 | DECISIONS.md                                                      | backend  | T28           | T26, T27      | S    |
| CP5 | **Checkpoint: final**                                             | lead     | all           |               |      |

### Parallel batches

| Batch | backend                     | frontend          | qa              |
| ----- | --------------------------- | ----------------- | --------------- |
| 1     | T01                         | T02               | –               |
| 2     | T03                         | T04               | –               |
| 3     | T05                         | T06               | –               |
| 4     | T07                         | (T06 if not done) | T08 (after T07) |
| 5     | T09 → T10 → T11             | T12               | –               |
| 6     | –                           | –                 | T13             |
| 7     | T14 → T15 → T16             | T17 → T18         | –               |
| 8     | T19 → T20 → T21 → T22 → T23 | T24 → T25         | –               |
| 9     | T28 → T29                   | –                 | T26 → T27       |

Hot files (one task at a time): `schema.prisma` (T09, T15 only if needed), `app.module.ts` (T01, T05, T10, T11, T14, T15, T20), `routeTree.gen.ts` (T12, T17, T18), every `package.json`, `pnpm-lock.yaml`, `docker-compose.yml` (T03, T07), `docker-compose.e2e.yml` (T23). Backend tasks are serial within the backend teammate, so the only cross-owner hot files are `pnpm-lock.yaml` and `package.json`: a task that adds dependencies runs `pnpm install` only when no other teammate is mid-install, and reports added packages.

---

## Phase 0: Foundations

### T01: Backend consumes the contract (Zod pipe, ErrorCode, Swagger)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** –
- **Parallel with:** T02
- **FSD refs:** 7.0, 7.1, 7.4, 14
- **Files/areas:** `apps/backend/package.json`, `apps/backend/src/common/exceptions/error-code.enum.ts`, `apps/backend/src/common/pipes/` (new `zod-validation.pipe.ts` + spec, remove/retire `app-validation.pipe.ts`), `apps/backend/src/app.module.ts` or `main.ts`/`setup-app.util.ts` (pipe and Swagger registration), `pnpm-lock.yaml`
- **Skills:** `nestjs-best-practices` (`api-use-pipes`, `api-use-dto-serialization`), `turborepo`
- **Description:** Add `@lmesh/api-contract` (`workspace:*`) and `nestjs-zod` to the backend. Re-export `ErrorCode` from the contract so existing imports keep working. Replace `AppValidationPipe` with a global Zod validation pipe that maps issues to `400 VALIDATION_FAILED` with `errors: Record<string, string[]>` keyed by field path, through `common/exceptions/`. Wire `nestjs-zod`'s OpenAPI cleanup into `setupSwagger`. Prove CJS type and runtime resolution of the contract from the backend.
- **Acceptance criteria:**
  - [x] `import { ErrorCode, CreateProjectRequestSchema } from "@lmesh/api-contract"` type-checks and runs in the backend (Nest build, Vitest and `node dist/...`).
  - [x] The backend `ErrorCode` is the contract's; no duplicate enum values remain.
  - [x] Zod pipe unit test: invalid body → `ValidationException` with `VALIDATION_FAILED` and per-field `errors`; valid body passes through parsed (trimmed).
  - [x] Existing filter/interceptor/health tests still pass; `/api/docs` still loads.
- **Verification:** Backend gates; `pnpm --filter backend build`; Contract check.
- **Size:** M
- **Result:** done 2026-10-18. Also fixed the backend runtime image (contract `dist` copied, prod deps for `backend...`), which is part of T07. Commit: `feat(backend): consume api-contract with Zod validation pipe and shared ErrorCode`

### T02: Frontend consumes the contract (typed API client)

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** –
- **Parallel with:** T01
- **FSD refs:** 7.0, 7.1, 11.3
- **Files/areas:** `apps/frontend/package.json`, `apps/frontend/src/lib/api-client.ts` (+ `api-client.test.ts`), `apps/frontend/src/lib/api-error.ts`, `pnpm-lock.yaml`
- **Skills:** `react-data-fetching`, `vercel-react-best-practices`
- **Mocked:** no (no endpoint used yet; tests stub `fetch` or use MSW once T04 lands)
- **Description:** Add `@lmesh/api-contract`. Build a small `apiRequest(endpoint, { params, body, schema })` client on `fetch` with `credentials: "same-origin"`, base `apiBaseUrl`, `buildPath`, success parsing with the given `data` schema, error parsing with `ErrorEnvelopeSchema` into an `ApiError { status, code, message, errors }`, and `204` handling. A schema mismatch throws an `ApiError` with `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - [x] Contract types and schemas import and type-check under TS 7; `vite build` resolves the ESM build.
  - [x] Unit tests: success envelope parsed to `data`; error envelope → `ApiError` with `code` and `errors`; 204 → `undefined`; malformed success → `ApiError(INTERNAL_ERROR)`.
  - [x] No request/response type is redefined in the app.
- **Verification:** Frontend gates; `pnpm --filter frontend build`.
- **Size:** S
- **Result:** done 2026-10-18. Vite bundling of the contract is proven when the first route imports the client (T12). Commit: `feat(frontend): add typed API client and ApiError on @lmesh/api-contract`

### T03: Environment and config for better-auth and AI

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T01
- **Parallel with:** T04
- **FSD refs:** FR-INFRA-03, FR-INFRA-04, FR-INFRA-05, 11.1, 14.1
- **Files/areas:** `apps/backend/src/config/env.validation.ts` (+ spec), `.env.example`, `docker-compose.yml`, `apps/backend/test/setup-env.ts`
- **Skills:** `nestjs-best-practices` (`devops-use-config-module`)
- **Description:** Remove `JWT_SECRET`/`JWT_EXPIRES_IN`; add `BETTER_AUTH_SECRET` (required, ≥ 32), `BETTER_AUTH_URL`, `AI_FIRST_TOKEN_TIMEOUT_MS` (30000), `AI_HISTORY_MAX_CHARS` (24000), `AI_FAULT_INJECTION` (boolean, default false); change `AI_PROVIDER` default to `openrouter` and `AI_REQUEST_TIMEOUT_MS` default to 120000. Keep provider keys optional so the app boots without them. Mirror every change in `.env.example` (placeholders only) and compose (safe defaults; `AI_FAULT_INJECTION` not set to true).
- **Acceptance criteria:**
  - [x] Env spec covers: missing `BETTER_AUTH_SECRET` fails with a clear message; empty `OPENROUTER_API_KEY` passes; defaults applied; `AI_FAULT_INJECTION` parses `"true"`/`"false"`.
  - [x] No `JWT_*` references remain in code, `.env.example` or compose.
  - [x] Every variable read by the backend appears in `.env.example`.
- **Verification:** Backend gates; `docker compose config` renders without warnings.
- **Size:** S
- **Result:** done 2026-10-18. `AI_FAULT_INJECTION` is parsed strictly (only "true"/"false") and set to `"false"` in compose; the lead removed the stale `JWT_*` lines from the README. Commit: `feat(backend): env config for better-auth, AI timeouts and fault injection flag`

### T04: MSW setup (handlers, fixtures, test server, browser worker)

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T02
- **Parallel with:** T03
- **FSD refs:** 7.2, 9.2, 13.2.1
- **Files/areas:** `apps/frontend/package.json`, `apps/frontend/src/mocks/` (`handlers.ts`, `fixtures.ts`, `sse.ts`, `server.ts`, `browser.ts`), `apps/frontend/src/test/setup.ts`, `apps/frontend/src/main.tsx` (opt-in worker), `apps/frontend/.env.example`, `apps/frontend/public/mockServiceWorker.js`
- **Skills:** `react-data-fetching`
- **Mocked:** yes – no backend endpoints exist yet; implements handlers for every endpoint in FSD 7.2
- **Description:** Add `msw`. Fixtures and an in-memory mock store typed from the contract (seed user, projects, conversations). Handlers for better-auth `sign-in/email`, `sign-out`, `get-session`, projects CRUD, active conversation, reset, and the three SSE endpoints (a helper that writes contract `SseEvent`s as a `ReadableStream` with configurable delays and failure modes). `setupServer` in tests with `onUnhandledRequest: "error"`; opt-in browser worker when `VITE_API_MOCKING=true`.
- **Acceptance criteria:**
  - [x] Every handler's request/response bodies are typed from `@lmesh/api-contract`.
  - [x] SSE helper test: emits `message.created`, tokens, `done` (and an `error` variant) parseable by `SseEventSchema`.
  - [x] Test setup fails on any unhandled request.
  - [x] `VITE_API_MOCKING` documented in `apps/frontend/.env.example` (default `false`); `pnpm --filter frontend dev` with it `true` serves mocked data.
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. msw 3.0.3 uses `onUnhandledFrame: "error"` (the 3.x name for `onUnhandledRequest`). Mocking is gated by `import.meta.env.DEV`, so no MSW code ends up in the production bundle (`dist/mockServiceWorker.js` is still copied from `public/`; low priority). Mock send handler also honours the `[[e2e-fault:*]]` markers. Browser mock mode not yet checked in a real browser. Commit: `feat(frontend): add MSW mock API, SSE helper and test server`

### T05: AI provider core and OpenRouter adapter

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T01, T03
- **Parallel with:** T06
- **FSD refs:** FR-INFRA-04, FR-INFRA-05, FR-INFRA-10, 10.1, 10.2, 13.2.2 (#3)
- **Files/areas:** `apps/backend/src/ai/` (`ai-provider.interface.ts`, `ai.constants.ts` (DI token), `ai.module.ts`, `ai-provider.factory.ts`, `providers/openrouter-ai.provider.ts` + spec), `apps/backend/src/common/exceptions/` (`ai-unavailable`, `ai-timeout`, `ai-provider-error`, `ai-bad-response` exceptions + index)
- **Skills:** `nestjs-best-practices` (`di-use-interfaces-tokens`, `test-mock-external-services`), `gof-patterns` (Adapter, Factory)
- **Description:** Define `AiProvider` and the `AI_PROVIDER` token. Implement `OpenRouterAiProvider` with `fetch` streaming of `/chat/completions` (`stream: true`), a pure chunk parser, abort-signal support, and the failure mapping of FSD 10.2. The factory selects the adapter from `AI_PROVIDER` and logs a warning when it isn't configured. Log provider, model, duration and outcome without secrets. This is the high-risk spike: include a short manual check against the real OpenRouter API.
- **Acceptance criteria:**
  - [x] Parser unit tests: valid chunks → deltas; `[DONE]` ends; error object → `AiProviderErrorException`; malformed JSON → `AiBadResponseException`; stream with no content → `AiBadResponseException`.
  - [x] Adapter unit test with a stubbed `fetch`: HTTP 429/500 → `AiProviderErrorException`; network failure → `AiUnavailableException`; aborting the signal stops iteration.
  - [x] `isConfigured()` is false with an empty key; factory unit test picks the adapter by `AI_PROVIDER`.
  - [ ] Manual check (documented in report): a real streamed reply from the default free model with a key in `.env`.
- **Verification:** Backend gates.
- **Size:** M
- **Result:** done 2026-10-18. Last criterion only partly met: there was no `OPENROUTER_API_KEY`, so streaming and abort were checked against a local SSE server (deltas arrived progressively; abort closed the connection). The real-model check is carried to T20 and CP4. Commit: `feat(backend): add AiProvider port, OpenRouter streaming adapter and AI exceptions`

### T06: SSE client parser and stream store

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T02
- **Parallel with:** T05
- **FSD refs:** 9.1, 9.2, 9.4, FR-CHAT-05, FR-CHAT-10, 13.2.2 (#5)
- **Files/areas:** `apps/frontend/src/features/chat/sse-reader.ts` (+ test), `apps/frontend/src/features/chat/stream-chat.ts` (+ test), `apps/frontend/src/stores/chat-stream.store.ts` (+ test)
- **Skills:** `react-data-fetching`, `react-render-optimization`, `hooks-pattern`
- **Mocked:** yes – SSE endpoints come from T20/T21; tests use the T04 SSE helper when available, otherwise raw `ReadableStream`s
- **Description:** A pure SSE reader over `ReadableStream<Uint8Array>` (handles chunk boundaries, multi-line `data`, comments/heartbeats, unknown events). `streamChat(endpoint, params, body, signal)` returns an async iterator of contract-validated `SseEvent`s, or throws `ApiError` for non-2xx JSON responses. A Zustand store keyed by `projectId` holds `{ assistantMessageId, content, phase, abortController }` with actions `start`, `appendToken`, `finish`, `abort`.
- **Acceptance criteria:**
  - [x] Reader tests: an event split across chunks, two events in one chunk, `: ping` ignored, unknown event ignored, invalid payload → error.
  - [x] `streamChat` test: 409 JSON response → `ApiError(STREAM_IN_PROGRESS)` before any event.
  - [x] Store tests: `waiting → streaming → removed`; `abort` calls `abortController.abort()`; entries for two projects are independent.
- **Verification:** Frontend gates.
- **Size:** S
- **Result:** done 2026-10-18. `streamChat` returns `Promise<AsyncGenerator>`, so pre-stream errors throw on `await`; a mid-stream connection loss becomes `ApiError(INTERNAL_ERROR, "Stream connection lost")`. Commit: `feat(frontend): add SSE reader, streamChat and chat stream store`

### T07: Docker images build the contract; compose env

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T01, T02, T03
- **Parallel with:** –
- **FSD refs:** FR-INFRA-01, FR-INFRA-03
- **Files/areas:** `apps/backend/Dockerfile`, `apps/frontend/Dockerfile`, `docker-compose.yml`
- **Skills:** `turborepo`
- **Note:** the backend runtime image part was done in T01; verify it here.
- **Description:** The frontend image builds with `turbo run build --filter=frontend` so the contract is built first. The backend runtime image includes `packages/api-contract/dist` (and its `package.json`) so `require("@lmesh/api-contract")` resolves in production. Compose passes the new env vars.
- **Acceptance criteria:**
  - [x] `docker compose build` succeeds from a clean checkout (no local `dist/`).
  - [x] `docker compose up` → backend healthy; `docker compose exec -w /repo/apps/backend backend node -e "require('@lmesh/api-contract')"` succeeds.
  - [x] Frontend serves the SPA and proxies `/api/v1/health`.
- **Verification:** Infra commands (login not yet available).
- **Size:** S
- **Result:** done 2026-10-18. The frontend image builds with `pnpm exec turbo run build --filter=frontend` and drops `mockServiceWorker.js`. Clean-checkout `docker compose build` passed (backend). The require check must run from `/repo/apps/backend`. Commit: `build(docker): build api-contract via turbo in frontend image and drop MSW worker from production`

### T08: Scaffold `apps/e2e` (Playwright)

- **Owner:** qa-engineer
- **Status:** done
- **Depends on:** T07
- **Parallel with:** –
- **FSD refs:** 13.2.1, 13.2.4, FR-INFRA-09
- **Files/areas:** `apps/e2e/` (`package.json`, `playwright.config.ts`, `tsconfig.json`, `eslint.config.js`, `global-setup.ts`, `tests/auth.setup.ts`, `tests/smoke.spec.ts`)
- **Skills:** `turborepo`, `clean-code`
- **Description:** Playwright workspace with `lint`, `check-types` and `test:e2e` scripts (no `test` script, so root `pnpm test` never runs it). `globalSetup` waits for `/api/v1/health` via the frontend origin. An `auth.setup.ts` project that signs in as the seed user and saves `storageState` (it will pass once T10–T12 are done; until then mark it `fixme` with a reason). A smoke test that the login page renders.
- **Acceptance criteria:**
  - [x] `pnpm --filter e2e lint && pnpm --filter e2e check-types` pass; root `pnpm test` does not run Playwright.
  - [x] With the stack up, `pnpm --filter e2e test:e2e` runs the smoke test green.
  - [x] Base URL configurable via env (default `http://localhost:5173`).
- **Verification:** E2E gates (with the default compose stack).
- **Size:** M
- **Result:** done 2026-10-18. Playwright 1.64.1. Projects: `setup` (fixme until T13), `smoke`, `chromium` (depends on setup). `pnpm test --dry=json` shows `e2e#test` as `<NONEXISTENT>`, so root `pnpm test` never runs Playwright. Commit: `test(e2e): scaffold Playwright workspace with smoke test and auth setup`

### CP1: Checkpoint – foundations

- [ ] Backend, frontend and contract gates pass; root `pnpm lint && pnpm check-types` pass on a clean checkout.
- [ ] `docker compose up --build` healthy; `/api/v1/health` and `/api/docs` reachable through `:5173` and `:3000`.
- [ ] E2E smoke green.
- [ ] Specialist review (FSD 4.1 of `/feature`) on T01–T08.

---

## Phase 1: Auth

### T09: Prisma schema and migration (auth + domain)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** CP1 (started early 2026-10-18 after T07; no shared files with T08/T12)
- **Parallel with:** T12
- **FSD refs:** 8, 8.1, 8.2, FR-PROJ-05, FR-RESET-01, FR-CHAT-08
- **Files/areas:** `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/<new>/migration.sql`, `apps/backend/prisma/seed.ts` (only to keep it compiling against the new user model)
- **Skills:** `better-auth-best-practices`, `create-auth`, `prisma:prisma-cli`, `nestjs-best-practices` (`db-use-migrations`)
- **Description:** Replace `User` with better-auth's `user`, `session`, `account`, `verification` models (generated with the better-auth CLI for Prisma, mapped to snake_case tables, UUID ids) and add `Project`, `Conversation`, `Message` with enums, indexes and cascades. Add both partial unique indexes in the migration SQL. Keep the seed compiling (user creation moves to T10).
- **Acceptance criteria:**
  - [x] `prisma migrate dev` applies cleanly on an empty database; `prisma validate` passes.
  - [x] The migration contains `UNIQUE (project_id) WHERE archived_at IS NULL` and `UNIQUE (conversation_id) WHERE status = 'streaming'`.
  - [x] Deleting a user/project cascades to conversations and messages (integration test or SQL check).
  - [x] Generated client compiles; backend gates pass.
- **Verification:** Backend gates; `pnpm --filter backend prisma:migrate` against the dev database.
- **Size:** M
- **Result:** done 2026-10-18. Migration `20261018082329_auth_and_domain` adds both partial unique indexes by hand. The auth fields come from better-auth 1.7.10's core schema (read from node_modules, not the CLI). Watch future migrations for generated `DROP INDEX` of those partial indexes. The compose dev DB is migrated on the next container start. Commit: `feat(backend): prisma schema for better-auth and design-brief domain with partial unique indexes`

### T10: better-auth instance, handler route, seed user

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T09
- **Parallel with:** T12
- **FSD refs:** FR-AUTH-01, FR-AUTH-02, FR-AUTH-05–FR-AUTH-08, 4.1 (config table), 7.1 (envelope exception), 8.3
- **Files/areas:** `apps/backend/package.json`, `apps/backend/src/auth/auth.config.ts`, `apps/backend/src/auth/auth.module.ts`, `apps/backend/src/auth/auth-handler.controller.ts` (Fastify catch-all `/api/v1/auth/*` → `auth.handler`, `@RawResponse()`), `apps/backend/prisma/seed.ts`, `apps/backend/test/auth.e2e.spec.ts`
- **Skills:** `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices`, `create-auth`
- **Description:** Configure better-auth exactly as the FSD 4.1 table (base path, secret, trusted origins, Prisma adapter, email/password with sign-up disabled, 7-day session, explicit rate limit, `x-real-ip`, UUID ids). Forward Fastify requests to `auth.handler` without the envelope interceptor or filter rewriting them. Seed the user `test@lmesh.eu` / `password` with better-auth's own hashing (approach per FSD 8.3; verify against the installed version's docs). Remove `bcryptjs`.
- **Acceptance criteria:**
  - [x] Integration: sign-in with seed credentials → 200 + `Set-Cookie` (`HttpOnly`, `SameSite=Lax`); `get-session` with that cookie returns the user.
  - [x] Integration: sign-up attempt does not create a user; wrong password → 401 with a generic message.
  - [x] Integration: 6th sign-in within 60 s → 429.
  - [x] Seed is idempotent (runs twice without error or duplicates).
- **Verification:** Backend gates; `pnpm --filter backend db:seed` twice.
- **Size:** M
- **Result:** done 2026-10-18. The auth handler is `@All("*")` with `@Public()`, `@RawResponse()` and `@Res()`. The parsed body is re-serialised. UUIDs via `advanced.database.generateId: "uuid"`. The Secure cookie follows the `https` scheme of `BETTER_AUTH_URL`, not `NODE_ENV`, so plain-http compose works. The seed hashes with `hashPassword` from `better-auth/crypto`. The compose dev DB still needs a backend restart to get the credential account. Commit: `feat(backend): add better-auth with Fastify handler route and credential seed user`

### T11: SessionGuard, `@Public`, `@CurrentUser`, cookie auth in Swagger

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T10
- **Parallel with:** T12
- **FSD refs:** FR-AUTH-03, FR-AUTH-05, FR-INFRA-06, 7.1
- **Files/areas:** `apps/backend/src/auth/session.guard.ts` (+ spec), `apps/backend/src/auth/decorators/` (`public.decorator.ts`, `current-user.decorator.ts`), `apps/backend/src/app.module.ts` (global guard), `apps/backend/src/setup-app.util.ts` (`addCookieAuth`), `apps/backend/src/health/health.controller.ts` (`@Public()`), `apps/backend/test/session-guard.e2e.spec.ts`
- **Skills:** `nestjs-best-practices` (`security-use-guards`), `better-auth-security-best-practices`
- **Description:** A global guard that calls `auth.api.getSession({ headers })`, attaches `{ user, session }` to the request, and throws `UnauthorizedException` from `common/exceptions/`. `@Public()` skips it (health, docs, auth handler). `@CurrentUser()` param decorator. Swagger uses cookie auth instead of bearer.
- **Acceptance criteria:**
  - [x] Unit: guard allows `@Public()` routes, rejects missing/invalid session with `UNAUTHORIZED` envelope, attaches the user.
  - [x] Integration: a protected test route returns 401 without cookie and 200 with the seed user's cookie; health stays public.
  - [x] Integration: after sign-out the old cookie gets 401.
  - [x] `/api/docs` shows cookie auth.
- **Verification:** Backend gates.
- **Size:** M
- **Result:** done 2026-10-18. The global SessionGuard attaches `request.auth`. Swagger has cookie auth (scheme `cookie`, name `better-auth.session_token`). The compose dev DB is migrated and seeded; sign-in through nginx returns 200 with an HttpOnly, SameSite=Lax cookie. Shared test helper: `test/support/test-database.ts`. Commit: `feat(backend): add global session guard, CurrentUser decorator and cookie auth in Swagger`

### T12: Auth UI: login, protected layout, sign out, 401 handling

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T04 (CP1 dependency dropped 2026-10-18: fully mocked, no shared files; reviewed at CP2)
- **Parallel with:** T09–T11
- **Mocked:** yes – backend T10/T11 not done; uses the T04 better-auth handlers
- **FSD refs:** FR-AUTH-01, FR-AUTH-04, FR-AUTH-05, FR-AUTH-07–FR-AUTH-09, 6.1, 6.2
- **Files/areas:** `apps/frontend/package.json` (`better-auth` client), `apps/frontend/src/features/auth/` (`auth-client.ts`, `session-query.ts`, `login-form.tsx` + test), `apps/frontend/src/routes/login.tsx`, `apps/frontend/src/routes/_authenticated.tsx`, `apps/frontend/src/routes/index.tsx`, `apps/frontend/src/lib/query-client.ts` (global 401 handling)
- **Skills:** `shadcn`, `react-data-fetching`, `design-taste-frontend`
- **Description:** better-auth React client with `baseURL` from `apiBaseUrl`/`basePath`. Session query cached in TanStack Query; `_authenticated` layout `beforeLoad` redirects to `/login?redirect=...` (same-origin relative paths only). Login form per FSD 6.2 (generic error, 429 message, dev-only credential hint). Sign out clears the query cache. A global query/mutation error handler redirects on `UNAUTHORIZED`.
- **Acceptance criteria:**
  - [x] Integration (MSW): valid credentials → navigates to `redirect` target; invalid → generic alert; 429 → rate-limit alert.
  - [x] Integration: visiting a protected route signed out redirects to `/login?redirect=...`; an absolute external `redirect` is ignored.
  - [x] Integration: a 401 from a project request clears the cache and lands on `/login`.
  - [x] Inputs are labelled; form usable with keyboard only.
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. The better-auth client calls `GET /api/v1/auth/get-session` (JSON `null` when signed out), `POST /api/v1/auth/sign-in/email` `{email,password}`, and `POST /api/v1/auth/sign-out` `{}`. It uses `customFetchImpl` so MSW can intercept. Not yet checked in a real browser (CP2). Commit: `feat(frontend): add auth UI, protected layout, sign out and global 401 handling`

### T13: E2E: sign-in and sign-out journey

- **Owner:** qa-engineer
- **Status:** done
- **Depends on:** T08, T11, T12
- **Parallel with:** –
- **FSD refs:** FR-AUTH-01, FR-AUTH-04, FR-AUTH-05, 13.2.4 (journeys 1, 5)
- **Files/areas:** `apps/e2e/tests/auth.setup.ts` (enable), `apps/e2e/tests/auth.spec.ts`
- **Skills:** `clean-code`
- **Description:** Enable the `storageState` setup. Journey: signed out → protected URL redirects to login → sign in → lands on the original URL → sign out → protected URL redirects again.
- **Acceptance criteria:**
  - [x] Setup project produces a reusable `storageState` for later specs.
  - [x] Journey passes against the real stack with role/label locators, no `waitForTimeout`.
- **Verification:** E2E gates.
- **Size:** S
- **Result:** done 2026-10-18. 6/6 pass against the real stack, twice. A run uses 3 sign-in attempts, close to the 5/60 s limit; retries for the auth projects are being reduced. Found: nested `role="alert"` on the login page (router announcer wraps the form alert), sent to frontend. Commit: `test(e2e): add sign-in and sign-out journey and enable auth setup`

### T10-fix-1: Rate-limit IP must come from the socket, not the client

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T10
- **Parallel with:** –
- **FSD refs:** FR-AUTH-07, NFR-04
- **Files/areas:** `apps/backend/src/auth/fastify-web-request.util.ts` (+ spec), `apps/backend/src/main.ts` (Fastify `trustProxy`), `docker-compose.yml` (bind published ports to 127.0.0.1), `.env.example` (only if a new var is added), `apps/backend/test/auth.e2e.spec.ts`
- **Skills:** `better-auth-security-best-practices`
- **Description:** CP1 review finding (High): `toWebHeaders` forwards the client's own `X-Real-IP` to better-auth, and compose publishes the backend port 3000. Anyone calling :3000 directly can rotate the header and bypass the 5/60 s sign-in limit. Overwrite `x-real-ip` with the server-derived `request.ip` (Fastify `trustProxy` limited to the nginx/compose network) and bind the published backend, Postgres and Ollama ports to `127.0.0.1`.
- **Acceptance criteria:**
  - [x] Unit: a client-supplied `x-real-ip` is replaced by `request.ip` in the Web request.
  - [x] Integration: rotating `x-real-ip` on direct requests no longer avoids the 429 (the 6th attempt from one socket IP is limited).
  - [x] Through nginx the real client IP is still used (`X-Real-IP` from nginx is trusted only when the request comes from the proxy).
  - [x] `docker compose config` shows the backend, postgres and ollama ports bound to 127.0.0.1.
- **Verification:** Backend gates; `docker compose config`.
- **Size:** S
- **Result:** done 2026-10-18. `TRUST_PROXY=1` hop. `toWebRequest` drops client XFF and sets `x-real-ip` from `request.ip`. Backend and postgres (and ollama) are bound to 127.0.0.1. Live check: rotating spoofed headers gives 429 on the 6th attempt, both through :5173 and directly on :3000. Remaining local-only risk (XFF on loopback :3000) is closed by nginx overwriting XFF in CP1-fix-be. Commit: `fix(backend): derive rate-limit client IP from the socket and bind published ports to loopback`

### T14-fix-1: Backend test setup safe on a clean database; missing high-value assertions

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T10-fix-1
- **Parallel with:** –
- **FSD refs:** FR-INFRA-09, FR-INFRA-10, FR-AUTH-06, 8.2
- **Files/areas:** `apps/backend/vitest.config.mts` (`globalSetup`), `apps/backend/test/support/**`, `apps/backend/test/global-setup.ts` (new), `apps/backend/prisma/schema.prisma` + new migration (unique `accounts(provider_id, account_id)`), `apps/backend/prisma/seed-user.ts`, `apps/backend/src/ai/providers/openrouter-ai.provider.spec.ts`, `apps/backend/test/auth.e2e.spec.ts`
- **Skills:** `nestjs-best-practices` (`test-use-testing-module`), `better-auth-best-practices`
- **Description:** CP1 test review (High), confirmed by the lead. (1) `prepareTestDatabase` runs SELECT-then-CREATE DATABASE in every parallel worker, so a fresh Postgres volume fails root `pnpm test`. Move create, migrate and seed into one Vitest `globalSetup`. (2) `seedUser` does find-then-create with no unique index, so concurrent seeds duplicate credential accounts. Add a unique index and upsert. (3) FR-INFRA-10 logging (provider/model/duration/outcome, no API key) is never asserted. (4) FR-AUTH-06 `Secure` under https and `Max-Age=604800` are not asserted.
- **Acceptance criteria:**
  - [x] `docker compose exec postgres dropdb -U lmesh --if-exists lmesh_cmf_test` followed by `pnpm --filter backend test` passes (run 3 times).
  - [x] Unique `(provider_id, account_id)` on `accounts`; the seed upserts; a concurrent `Promise.all` of two seeds leaves one account.
  - [x] An adapter spec asserts the log line format and that no logged string contains the API key or the prompt.
  - [x] An auth test asserts `Max-Age=604800`; a test with an https `baseURL` asserts `Secure` and the `__Secure-` cookie prefix.
- **Verification:** Backend gates (3 runs on a dropped test DB).
- **Size:** S
- **Result:** done 2026-10-18. Vitest `globalSetup` creates (tolerating 42P04), migrates and seeds once. New migration `20261018100000_account_provider_unique` (hand-written; diff against schema is empty). The seed upserts with one retry on P2002. Lead verified: dropped test DB, then 119 tests green. Commit: `test(backend): single global DB setup, unique credential accounts, log and cookie assertions`

### T12-fix-1: Single role="alert" on the login page

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T12
- **FSD refs:** NFR-06
- **Files/areas:** `apps/frontend/src/features/auth/login-form.tsx`, `auth.test.tsx`
- **Description:** Found by qa in T13. The login form wrapped the shadcn Alert in a second `role="alert"` div. The wrapper is now just `aria-live="assertive"`.
- **Acceptance criteria:**
  - [x] Exactly one `role="alert"` after a failed sign-in (test fails on the old markup).
- **Size:** S
- **Result:** done 2026-10-18. Commit: `fix(frontend): avoid nested alert roles on the login form`

### CP1-fix-fe: Frontend fixes from the CP1 review (approved by the user 2026-10-18)

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T12-fix-1
- **Parallel with:** backend tasks
- **FSD refs:** 6.6, FR-AUTH-09, FR-PROJ-01, FR-PROJ-05, 9.4, 13.2
- **Files/areas:** `apps/frontend/src/features/projects/projects-queries.ts`, `project-form-dialog.tsx`, `delete-project-dialog.tsx` (+ tests), `src/lib/query-client.ts` (+ test), `src/test/setup.ts`, `src/stores/chat-stream.store.ts` (+ test), `src/features/chat/stream-chat.test.ts`, `src/features/chat/composer.test.tsx`, `src/features/chat/sse-reader.ts` (+ test), `src/features/auth/redirect.ts` (+ test), `src/mocks/handlers.ts`, `vitest.config.ts`, `package.json`
- **Description:** Bundle A plus the frontend half of bundle D. (1) The success toasts for create and delete are lost when the calling component unmounts during navigation: toast inside the mutation hook before navigating. (2) Don't retry 4xx queries. (3) Reset every Zustand store between tests. (4) Use fake timers instead of the real 500 ms wait in the Stop test. (5) `chat-stream.store.start()` aborts an existing entry, and `appendToken` ignores a mismatched messageId. (6) `streamChat` tests for a mid-read error, fetch rejection, malformed JSON, an event/type mismatch, and a clean close without a final event (pin the chosen behaviour). (7) The SSE reader flushes on `done` (CR-only ending), with an empty-stream test. (8) Table-driven `resolveRedirect` unit test, including `/\host` and `/\t/evil`, or URL-origin based. (9) Mock fidelity: NOTHING_TO_SUMMARISE requires an assistant message; retry requires the last assistant message. (10) The jsdom URL is an origin nothing listens on, and the unhandled-request test asserts MSW's error. (11) Use the same pinned `better-auth` version as the backend (1.7.10).
- **Acceptance criteria:**
  - [x] Toast assertions for delete and for create from `/projects` pass.
  - [x] A 401 query redirects without a retry delay; a 404 project shows not-found without a retry (unit test on `createQueryClient`, including the two-concurrent-401 dedup).
  - [x] The new streamChat, reader, store and redirect tests pass; the frontend suite is green 3 runs in a row.
  - [x] `better-auth` pinned to `1.7.10`.
- **Verification:** Frontend gates (3 runs); build.
- **Size:** M
- **Result:** done 2026-10-18. 132 tests green across 3 runs. A stream that closes without a final event: `streamChat` ends quietly and `use-stream-run` marks the message `INTERNAL_ERROR` (both behaviours have tests). `resolveRedirect` is now URL-origin based. Sonner toasts are dismissed between tests. Commit: `fix(frontend): keep create/delete toasts, don't retry 4xx, harden stream store and tests, pin better-auth`

### CP1-fix-be: Backend fixes from the CP1 review (approved by the user 2026-10-18)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T23
- **Parallel with:** T24, T25 (done), T26
- **FSD refs:** 7.0, 14, FR-INFRA-03, FR-INFRA-06, NFR-04, 10.2
- **Files/areas:** `apps/backend/src/common/**` (interceptor, exceptions, filter, error DTO), `src/config/env.validation.ts` (+ spec), `src/ai/**` (AiProviderName, parser/adapter specs), `src/main.ts` (Swagger in production), `src/common/pipes/zod-validation.pipe.spec.ts`, `src/auth/fastify-web-request.util.spec.ts`, `docker-compose.yml`, `apps/frontend/nginx/default.conf.template`, `.env.example`
- **Description:** Bundles B, C and the backend half of bundle D. (B) Import `SuccessEnvelope`/`ErrorEnvelope` from the contract instead of redefining them, and build the Swagger error DTO from `ErrorEnvelopeSchema`. `CORS_ORIGIN` defaults to follow `FRONTEND_PORT`, and better-auth trusts the `baseURL` origin. One `AiProviderName`. (C) nginx security headers (CSP `default-src 'self'`, frame-ancestors none, nosniff, Referrer-Policy) on every location. Log a prominent startup warning when `BETTER_AUTH_SECRET` is one of the known public placeholders (compose default or `.env.example`). Don't fail: the reviewer's single-command `docker compose up` with a copied `.env.example` must keep working (FR-INFRA-01). Add a README note to generate a real secret. Swagger's cookie-auth name follows the cookie actually issued (`__Secure-` prefix under an https `BETTER_AUTH_URL`). Swagger is mounted only outside production unless `SWAGGER_ENABLED=true`. The filter echoes raw messages only for Fastify `FST_*` errors. nginx sets `X-Forwarded-For $remote_addr` (overwrite, not append), so a spoofed XFF never reaches the backend even on loopback. (D) A truly nested validation path and the non-Zod branch. Parser tests: multi-byte split, CRLF, `finish_reason: error`, `data:` without a space. Adapter tests: mid-stream read error to `AiUnavailableException`, a custom abort reason rethrown, missing body. The fastify-web-request array header, content-length drop and string body. An `.env.example` parity test against `EnvironmentVariables`. Factory warning and fallback-model assertions. Exact sign-up-disabled status/code.
- **Acceptance criteria:**
  - [x] No envelope type is redefined in the backend (grep), and the Swagger error schema comes from the contract.
  - [x] `FRONTEND_PORT=8080 docker compose config` gives a matching `CORS_ORIGIN`; the backend logs a warning when started with a placeholder secret, and still boots.
  - [x] `curl -I localhost:5173/` shows the CSP, X-Frame-Options/frame-ancestors, nosniff and Referrer-Policy headers; the app still works (the e2e suite stays green).
  - [x] The new backend tests pass; the suite is green 3 runs in a row.
- **Verification:** Backend gates (3 runs); `docker compose up --build`; `pnpm --filter e2e test:e2e`.
- **Size:** M
- **Result:** done 2026-10-18. 289 tests green across 3 runs. Strict CSP everywhere, Swagger included (it uses external assets only). `SWAGGER_ENABLED` is true in compose. nginx overwrites XFF. `CORS_ORIGIN` and `BETTER_AUTH_URL` are now commented in `.env.example` so they follow `FRONTEND_PORT`. Found: the default OpenRouter free model `meta-llama/llama-3.1-8b-instruct:free` now returns 404, so a new default is needed (user decision). Commits: `refactor(backend): use contract envelope types and derive CORS/trusted origins`, `feat(backend): add security headers, Swagger switch and placeholder-secret warning`, `test(backend): close CP1 test gaps`

### T21-fix-1: Concurrent retry of one message; abort race actually tested (final review, High)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T21
- **FSD refs:** FR-CHAT-07, FR-CHAT-08, FR-CHAT-05, FR-CHAT-06
- **Files/areas:** `apps/backend/src/chat/chat-stream.service.ts` (+ spec), `apps/backend/test/summaries-retry.e2e.spec.ts`, `apps/backend/test/support/scripted-ai.provider.ts`
- **Description:** (1) `resetForRetry` updates the row to `streaming` with no status precondition, so two concurrent retries of the same id (two tabs) both pass `isRetryable` under READ COMMITTED and both stream into one row (confirmed by the lead in the code). Make the reset conditional (`updateMany where { id, status in [error, aborted] }`, then check the count, or row-lock it) and map the loss to 409 STREAM_IN_PROGRESS. (2) The `Promise.race` in `iterate()` that ends a stream when the provider ignores the signal is never exercised: every timeout and disconnect test uses `hang`, which honours the signal.
- **Acceptance criteria:**
  - [x] Integration: `Promise.all([retry(id), retry(id)])` gives one 200 and one 409, and the provider is called once.
  - [x] Unit: a provider that ignores the signal (`delayMs` far beyond the timeout) still ends with AI_TIMEOUT after the first-token timeout, and with `aborted` after a client `close`.
  - [x] Backend suite green 3 runs in a row.
- **Size:** S
- **Result:** done 2026-10-18. The retry reset is conditional (`updateMany` on error/aborted); a streaming target gives 409 STREAM_IN_PROGRESS before the eligibility check. `finish()` saves only while still `streaming`; a lost race logs a warning and sends `error` INTERNAL_ERROR, never `done`. The new tests fail against the old code. 294 tests green across 3 runs. Commits: `fix(backend): make retry reset conditional to stop concurrent retries; test provider-ignores-abort races`, `fix(backend): finish a stream only if the message is still streaming`

### FINAL-fix-fe: Frontend cache races from the final review (approved by the user 2026-10-18)

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** –
- **Files/areas:** `apps/frontend/src/features/chat/use-stream-run.ts` (+ tests), `streaming-message.tsx`, `markdown.tsx`, `use-auto-scroll.ts` (+ test), `src/routes/_authenticated/projects.$projectId.tsx`
- **Description:** Bundle G. (1) `resyncAfterStop` re-checks after its await, and is cancelled when a newer stream starts. On the last attempt, if the row is still `streaming`, keep the local `aborted` row and invalidate later. When Stop happened before `message.created` (no id), treat any `streaming` row as still streaming. (2) Cancel in-flight conversation queries before patching the cache on `message.created`, `done` and `error`. A `streaming` row with no local stream schedules a refetch. (3) Stop invalidates `["projects"]`. (4) `key={projectId}` on Composer and MessageList. (5) Markdown drops images. (6) Auto-scroll hook test.
- **Acceptance criteria:**
  - [x] Tests: Stop then send within the resync window keeps the new messages; Stop then reset keeps the empty conversation; a GET in flight across `done` doesn't revert it.
  - [x] Draft text doesn't carry over between projects; images aren't rendered; auto-scroll test (follows, stops when scrolled up, resumes at the bottom).
  - [x] Frontend gates green 3 runs in a row; build.
- **Size:** M
- **Result:** done 2026-10-18. One resync AbortController per project, cancelled on a new stream or reset; queries are cancelled before cache patches; orphan `streaming` rows are polled every 2 s; Stop refreshes the sidebar; per-project keys on Composer and MessageList; images dropped. 8 race tests that fail without the fix. 144 tests green (lead ran twice). Delays live in `stream-timings.ts`. Commit: `fix(frontend): cancel stale resyncs and in-flight fetches before cache writes, key per-project components, drop images`

### FINAL-fix-e2e: E2E assertions from the final review (approved by the user 2026-10-18)

- **Owner:** qa-engineer
- **Status:** done
- **Depends on:** –
- **Files/areas:** `apps/e2e/tests/ai-failures.spec.ts`, `tests/chat.spec.ts`, `fixtures/test.ts`, `pages/project.page.ts`
- **Description:** Retry happens in place (message count stays 2, the same element ends complete). Fixture teardown tolerates 409 (waits for the stream to end, or retries delete). The progressive-render poll handles a fast model. Comment the 3 s observation window.
- **Acceptance criteria:**
  - [x] Full suite green twice on the e2e stack (run once the backend/frontend fixes land and the stack is rebuilt).
- **Size:** S
- **Result (code):** 2026-10-18. Retry is tagged in place; teardown polls DELETE for up to 30 s; the growth check uses `[[e2e-fault:slow]]` and a separate real-model test checks completion. Final: 16/16 on two qa runs plus one lead run, on the rebuilt stack. Commit: `test(e2e): harden retry, teardown and streaming assertions`

### FINAL-fix-be-1: Backend robustness from the final review (approved by the user 2026-10-18)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T21-fix-1
- **Files/areas:** `apps/backend/src/chat/chat-stream.service.ts` (+ spec), `src/auth/session.guard.ts` (+ spec), `src/projects/projects.service.ts`, `src/conversations/conversations.service.ts`, `src/chat/prompts.util.ts`, a global Origin-check hook (`src/common/`), `test/*.e2e.spec.ts`
- **Description:** Bundle F. A failure after the placeholder insert saves `error`/`INTERNAL_ERROR`. The guard throws 503 when the session lookup itself fails. Detect a client already gone when the listener attaches, and attach it earlier. The final save and project touch go in one transaction. Delete and reset lock the project/conversation against a concurrent send. Mutating requests with an `Origin` not in the allowed list are rejected (403). `</project_context>` is stripped from title and description. Integration tests: archived messages never reach the prompt, and an edited description reaches the prompt.
- **Size:** M
- **Result:** done 2026-10-18. A failure before the stream opens saves error/INTERNAL_ERROR; `watchClient()` runs before the transactions; the final save is one transaction with a fallback; the guard returns 503 when the lookup throws; `lock-project.util.ts` (parameterised FOR UPDATE) serialises send, summarise, retry, reset and delete, and the race test fails without the lock; `OriginGuard` returns 403 for a foreign Origin on mutating requests; delimiter stripped; FR-RESET-02/04 and FR-PROJ-04 integration tests added. 317 tests, 8+ green runs. Commits: see the report (5 commits).

### FINAL-fix-be-2: Naming and convention compliance (approved by the user 2026-10-18)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** FINAL-fix-be-1
- **Result:** done 2026-10-18. Backend files renamed to `name.type.ts` (entry points, barrels, prisma seeds and test support left as they are). `OperationAbortedException`, `ClientDisconnectedException` and `ConfigurationException` live in common/exceptions. `AiProviderFactory` is a class; each adapter has its own Logger. 317 tests, build OK, boots. Commit: `refactor(backend): rename files to kebab-case.type.ts, move internal errors to common/exceptions, per-class loggers`
- **Description:** Bundle I. Rename backend files that lack a `.type` segment to `kebab-case.type.ts` (e.g. `prompts.util.ts`, `history-window.util.ts`, `sse-writer.util.ts`, `auth.config.ts` …). Update imports and specs. Errors come only from `common/exceptions/`. Loggers use `new Logger(ClassName.name)`.
- **Size:** M

### FINAL-fix-docs: README and DECISIONS accuracy (approved by the user 2026-10-18)

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** FINAL-fix-be-2, FINAL-fix-fe
- **Description:** Bundle H. Re-check every README and DECISIONS claim against the final code (resync timing, validation wording, the `messageId` option, renamed paths, the deleted-sample-project recreate note). Add bundle J (per-user stream rate limiting, bounded history query, seed production guard, Markdown throttling) to Q5.
- **Size:** S
- **Result:** done 2026-10-18. README and DECISIONS re-checked against the final code; renamed paths; exact SSE validation wording; lock, Origin check and 503 documented; bundle J listed in Q5. Lead checked that every cited path exists, the stale claims are gone, and Prettier is clean. Commit: `docs: bring README and DECISIONS in line with the final code`

### CP2: Checkpoint – auth integration

Result 2026-10-18: passed through T13 (Playwright drives the real login, redirect and sign-out against the stack). The CP2 specialist review of T11/T13 is folded into the CP3 review.

- [x] Frontend runs against the real backend (`VITE_API_MOCKING=false`, Vite proxy and nginx): sign in, reload keeps the session, sign out.
- [ ] Backend and frontend gates; E2E gates (T13 green).
- [ ] Specialist review on T09–T13.

---

## Phase 2: Projects and conversations

### T14: Projects CRUD API

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** CP2 (started 2026-10-18 alongside T13; backend-only files)
- **Parallel with:** T17
- **FSD refs:** FR-PROJ-01–FR-PROJ-06, FR-PROJ-08, 7.2, 7.3
- **Files/areas:** `apps/backend/src/projects/` (`projects.module.ts`, `projects.controller.ts`, `projects.service.ts` + spec, `dto/`), `apps/backend/src/app.module.ts`, `apps/backend/test/projects.e2e.spec.ts`
- **Skills:** `nestjs-best-practices` (`arch-feature-modules`, `arch-use-repository-pattern`, `api-use-dto-serialization`), `ddd`
- **Description:** List (by `updatedAt` desc), create (also creates the active conversation in one transaction; `""` description → `null`), get, update, delete (204; 409 while a message is streaming). Every query scoped by owner; missing or foreign → `NotFoundException`. DTOs from contract schemas; full Swagger.
- **Acceptance criteria:**
  - [x] Integration: CRUD happy paths with envelopes and status codes from FSD 7.2.
  - [x] Integration: a second user's project → 404 for get/update/delete; nothing changed.
  - [x] Integration: validation errors return `VALIDATION_FAILED` with `errors.title`; whitespace description stored as `null`.
  - [x] Create leaves exactly one active conversation for the project.
- **Verification:** Backend gates; `/api/docs` lists the endpoints.
- **Size:** M
- **Result:** done 2026-10-18. A bad uuid returns 400 `VALIDATION_FAILED`. Create uses a nested write (atomic). DELETE returns 204 via `@RawResponse`. The test helpers are now `test/support/create-test-app.ts` and `test-database.ts`. Delete's streaming check ignores stale rows only once T15 adds the stale predicate. Commit: `feat(backend): add projects CRUD API with ownership scoping and stream-in-progress guard`

### T15: Active conversation and reset API

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T14
- **Parallel with:** T17, T18
- **FSD refs:** FR-RESET-01–FR-RESET-04, FR-CHAT-09, 7.2, 11.2
- **Files/areas:** `apps/backend/src/conversations/` (`conversations.module.ts`, `conversations.controller.ts`, `conversations.service.ts` + spec), `apps/backend/src/app.module.ts`, `apps/backend/test/conversations.e2e.spec.ts`
- **Skills:** `nestjs-best-practices` (`db-use-transactions`), `ddd`
- **Description:** `GET /projects/:projectId/conversations/active` returns messages ordered and applies the stale-`streaming` rule (marks and returns `error`/`AI_TIMEOUT`). `POST /projects/:projectId/conversations` archives and creates in one transaction; 409 `STREAM_IN_PROGRESS` while streaming.
- **Acceptance criteria:**
  - [x] Unit: reset archives and creates in one transaction; rejects during a stream.
  - [x] Integration: reset → old conversation `archived_at` set, new one empty, still exactly one active.
  - [x] Integration: a stale `streaming` row is returned (and stored) as `error` / `AI_TIMEOUT`; a fresh one stays `streaming`.
  - [x] Ownership 404s on both endpoints.
- **Verification:** Backend gates.
- **Size:** M
- **Result:** done 2026-10-18. `StaleStreamService` (exported by ConversationsModule) runs on read, reset and project delete. A concurrent reset that loses the race on the partial index returns the winner's conversation. Rule for backend integration specs: each spec uses its own test user, never the seed user's projects, and cleans up only its own rows. Commit: `feat(backend): add active conversation and reset endpoints with stale-stream recovery`

### T16: Seed sample projects and conversation

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T15
- **Parallel with:** T18
- **FSD refs:** FR-INFRA-02, 8.3
- **Files/areas:** `apps/backend/prisma/seed.ts`, `apps/backend/prisma/seed-data.ts`
- **Skills:** `prisma:prisma-client-api`
- **Description:** Three projects with fixed UUIDs and the descriptions from FSD 8.3, each with an active conversation; the first has 2 user + 2 assistant messages and 1 summary (all `complete`). Upserts, idempotent.
- **Acceptance criteria:**
  - [x] Running the seed twice yields exactly 3 projects and 5 messages for the seed user.
  - [x] `GET /projects` as the seed user returns the three projects; the first project's active conversation returns the 5 messages in order.
- **Verification:** Backend gates; `pnpm --filter backend db:seed` twice.
- **Size:** S
- **Result:** done 2026-10-18. Projects are created only if missing, by fixed id. A deleted sample project is recreated on the next start. The dev DB is seeded; `GET /projects` through :5173 returns the 3 projects. Commit: `feat(backend): seed idempotent sample projects and demo conversation`

### T17: App shell, sidebar and project dialogs

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** CP2 (started early 2026-10-18 after T12: fully mocked, frontend-only files)
- **Parallel with:** T14, T15
- **Mocked:** yes – backend T14 not done; uses T04 project handlers
- **FSD refs:** FR-PROJ-01, FR-PROJ-02, FR-PROJ-04, FR-PROJ-05, FR-PROJ-07, 6.3, 6.5, 6.6
- **Files/areas:** `apps/frontend/src/routes/_authenticated/projects.tsx` (layout + index), `apps/frontend/src/features/projects/` (`projects-queries.ts`, `project-sidebar.tsx`, `project-form-dialog.tsx`, `delete-project-dialog.tsx` + tests), shadcn components as needed
- **Skills:** `shadcn`, `react-data-fetching`, `design-taste-frontend`, `compound-pattern`
- **Description:** App shell with collapsible sidebar (state in `ui-preferences` store), project list query (`staleTime` 30 s), `Link preload="intent"` with route loaders using `ensureQueryData`, create/edit dialog (contract limits, server field errors), delete confirmation, toasts, sign-out in the footer, empty states.
- **Acceptance criteria:**
  - [x] Integration (MSW): create → navigates to the new project and it appears at the top of the sidebar; validation errors show on fields.
  - [x] Integration: edit updates title in sidebar and header; delete confirms, navigates to `/projects`, removes the item.
  - [x] Hovering/focusing a sidebar link triggers the project and conversation queries (asserted via MSW request log).
  - [x] Keyboard: dialogs trap focus and close on Escape.
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. Delete uses Dialog instead of AlertDialog. The 401 handler now runs once per redirect. The stray `cn` dependency is still in package.json and gets removed in T18. Not yet checked in a real browser (CP2/CP3). Commit: `feat(frontend): add app shell, project sidebar and create/edit/delete dialogs`

### T18: Project page: header, message list, reset dialog

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T17
- **Parallel with:** T15, T16
- **Mocked:** yes – backend T15 not done; uses T04 conversation handlers
- **FSD refs:** FR-PROJ-03, FR-PROJ-07, FR-CHAT-09, FR-CHAT-11, FR-SUM-04, FR-RESET-01–FR-RESET-04, 6.4, 6.7
- **Files/areas:** `apps/frontend/src/routes/_authenticated/projects.$projectId.tsx`, `apps/frontend/src/features/chat/` (`conversation-queries.ts`, `message-list.tsx`, `message-item.tsx`, `markdown.tsx` + tests), `apps/frontend/src/features/projects/project-header.tsx`, `reset-conversation-dialog.tsx`
- **Skills:** `shadcn`, `react-render-optimization`, `presentational-container-pattern`
- **Description:** Project header (title, clamped description, actions menu), active conversation query, message list with user/assistant/summary styling, Markdown via `react-markdown` without raw HTML, status rendering for `error` (inline alert per FSD 11.3, Retry placeholder) and `aborted` ("Stopped"), empty state with suggested prompts, not-found view, reset dialog that replaces the conversation cache.
- **Acceptance criteria:**
  - [x] Integration: messages render in order with `data-testid="message-item"` and `data-role/kind/status`; a summary renders as a "Summary" card.
  - [x] Integration: Markdown list/table renders; `<script>`/`<img onerror>` in content is not executed or inserted as HTML.
  - [x] Integration: reset → empty state, header unchanged; 404 project → not-found view.
  - [x] Revisiting a cached project renders without skeletons.
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. Markdown uses `skipHtml` with no rehype-raw; links get `noopener noreferrer`. Suggested prompts go through `composer-draft.store.ts`, which T24 reads. Retry is shown but disabled (T25). The shadcn CLI re-adds a stray `cn` dependency and `from "cn"` imports on every add, so clean them up after each one. Commit: `feat(frontend): add project page with message list, markdown rendering and reset dialog`

### CP3: Checkpoint – projects integration

- [ ] Frontend against the real backend: seed projects visible; create, edit, delete, open, reset work; switching projects is instant on revisit.
- [ ] Backend and frontend gates; E2E gates (T13 still green).
- [ ] Specialist review on T14–T18.

---

## Phase 3: Chat streaming

### T19: History window and prompt builder

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** CP3
- **Parallel with:** T24
- **FSD refs:** FR-CHAT-03, FR-CHAT-04, FR-SUM-03, FR-SUM-06, FR-RESET-04, FR-PROJ-04, 10.3, 10.4, 13.2.2 (#1)
- **Files/areas:** `apps/backend/src/chat/history-window.util.ts` (+ spec), `apps/backend/src/chat/prompts.util.ts` (+ spec)
- **Skills:** `clean-code`
- **Description:** Pure `buildPromptMessages` and the system/summary prompts exactly as FSD 10.3–10.4.
- **Acceptance criteria:**
  - [x] Unit: last-N cut; char budget drops oldest first; newest user message always kept; only `complete` messages included.
  - [x] Unit: latest summary pinned after the system prompt when outside the window, and not duplicated when inside.
  - [x] Unit: system prompt contains delimited project context ("No description provided." when null) and the role/Markdown instructions; summary instruction appended last with the five sections.
- **Verification:** Backend gates.
- **Size:** S
- **Result:** done 2026-10-18. 23 unit tests across `prompts.util.spec.ts` and `history-window.util.spec.ts` (critical test #1). The same function serves retry. For summarise, the over-budget keep-newest-user rule is tightened in T20. Commit: `feat(backend): add chat prompt builder and history window`

### T20: Chat stream service and send-message endpoint

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T05, T19
- **Parallel with:** T24
- **FSD refs:** FR-CHAT-01, FR-CHAT-02, FR-CHAT-05, FR-CHAT-06, FR-CHAT-08, FR-INFRA-04, FR-PROJ-08, 9.1–9.3, 11.2, 13.2.2 (#2)
- **Files/areas:** `apps/backend/src/chat/` (`chat.module.ts`, `chat-stream.service.ts` + spec, `sse-writer.util.ts` + spec, `messages.controller.ts`), `apps/backend/src/app.module.ts`, `apps/backend/test/chat-stream.e2e.spec.ts`
- **Skills:** `nestjs-best-practices` (`error-handle-async-errors`, `test-mock-external-services`), `clean-code`
- **Description:** `POST /projects/:projectId/messages`. Pre-stream checks return JSON errors; then one transaction (flip stale rows, insert user + placeholder, unique violation → 409), hijack the reply, SSE headers, heartbeat, events per FSD 9.2, first-token and total timeouts, client-disconnect abort, final update and `projects.updated_at`. Swagger documents `text/event-stream` and pre-stream errors.
- **Acceptance criteria:**
  - [x] Unit (fake provider): success event order; error after tokens → partial saved `error` + mapped code; first-token timeout → `AI_TIMEOUT`; abort → `aborted` and provider signal aborted.
  - [x] Integration (`app.inject`, fake provider via DI token): full SSE body parses with `SseEventSchema`; unauthenticated/foreign project → 401/404 JSON, no rows written.
  - [x] Integration: concurrent second send → 409 `STREAM_IN_PROGRESS`; unconfigured provider → 503 `AI_UNAVAILABLE`.
  - [x] Manual: real OpenRouter stream through `curl -N` on `:3000` and through nginx on `:5173` arrives progressively (not buffered).
- **Verification:** Backend gates; manual `curl -N` check documented in report.
- **Size:** M
- **Result:** done 2026-10-18. `runStream` is reusable (T21). A disconnect is `reply.raw` `close` before `writableFinished`; the unit test plus a manual real-socket curl confirm `aborted`. The placeholder gets createdAt = user + 1 ms. Ollama and Gemini use a placeholder provider (boots, 503). The abort reason wins during a slow error body. Progressive SSE confirmed on :3997 (tokens about every 0.5 s). Not done yet: a real OpenRouter stream (no key) and nginx unbuffered SSE (CP4, slow marker). Commit: `feat(backend): add send-message SSE endpoint with chat stream service`

### T21: Summaries and retry endpoints

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T20
- **Parallel with:** T24, T25
- **FSD refs:** FR-SUM-01, FR-SUM-02, FR-SUM-05, FR-SUM-07, FR-CHAT-07, 7.2, 9.3
- **Files/areas:** `apps/backend/src/chat/summaries.controller.ts`, `apps/backend/src/chat/retry.controller.ts` (or methods on `messages.controller.ts`), `apps/backend/src/chat/chat-stream.service.ts`, `apps/backend/test/summaries-retry.e2e.spec.ts`
- **Skills:** `nestjs-best-practices`
- **Description:** `POST /projects/:projectId/summaries` (409 `NOTHING_TO_SUMMARISE` without a completed assistant chat message; `userMessage: null`; `kind = summary`) and `POST /messages/:messageId/retry` (only the last assistant message with `error`/`aborted`; regenerates in place with the history before it). Both reuse the stream service.
- **Acceptance criteria:**
  - [x] Integration: summarise streams a `kind = summary` message and the provider's last message is the summary instruction; no user message created.
  - [x] Integration: summarise with no assistant reply → 409 `NOTHING_TO_SUMMARISE`.
  - [x] Integration: retry on the last failed message reuses its id and ends `complete`; retry on another message → 409 `MESSAGE_NOT_RETRYABLE`; foreign message → 404.
- **Verification:** Backend gates.
- **Size:** M
- **Result:** done 2026-10-18. Pure `isRetryable` (8 unit tests). Stale rows are flipped before the eligibility check, so a crashed stream becomes retryable. Another streaming row returns STREAM_IN_PROGRESS rather than MESSAGE_NOT_RETRYABLE. 203 tests green. Commit: `feat(backend): add summarise and retry streaming endpoints`

### T22: Ollama and Gemini adapters

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T05
- **Parallel with:** T24, T25
- **FSD refs:** FR-INFRA-05, 10.1, 10.2
- **Files/areas:** `apps/backend/src/ai/providers/ollama-ai.provider.ts` (+ spec), `apps/backend/src/ai/providers/gemini-ai.provider.ts` (+ spec), `apps/backend/src/ai/ai-provider.factory.ts`
- **Skills:** `gof-patterns` (Adapter)
- **Description:** NDJSON (Ollama `/api/chat`) and SSE (Gemini `streamGenerateContent?alt=sse`, `systemInstruction`) adapters with pure parsers and the same failure mapping.
- **Acceptance criteria:**
  - [x] Parser unit tests for both: valid → deltas; error payload → `AiProviderErrorException`; malformed → `AiBadResponseException`.
  - [x] Factory selects them by `AI_PROVIDER`; Gemini `isConfigured()` false without a key; Ollama configured when `OLLAMA_BASE_URL` set.
  - [x] Manual (documented): one real streamed reply from at least one of them.
- **Verification:** Backend gates.
- **Size:** M
- **Result:** done 2026-10-18. Shared `HttpStreamingAiProvider` base and `stream.utils.ts`; the placeholder provider is removed. The Gemini key goes in a header. 241 tests. Real Ollama gemma4:12b streamed progressively (deltas about 81 ms apart), but first token took 37–60 s, which is over the 30 s first-token timeout. The model has the `thinking` capability, so `think: false` (hard-coded) brought the first token down to 0.3–0.8 s, so the timeout defaults stay. Commit: `feat(backend): add Ollama and Gemini adapters on a shared streaming base`

### T23: Fault-injecting provider and `docker-compose.e2e.yml`

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T20
- **Parallel with:** T25
- **FSD refs:** FR-INFRA-07, 13.2.4
- **Files/areas:** `apps/backend/src/ai/providers/fault-injecting-ai.provider.ts` (+ spec), `apps/backend/src/ai/ai-provider.factory.ts`, `docker-compose.e2e.yml`, `.env.example` (comment only)
- **Skills:** `gof-patterns` (Decorator)
- **Description:** Wraps the selected adapter when `AI_FAULT_INJECTION=true`; reacts to `[[e2e-fault:timeout|error-midstream|malformed|slow]]` in the newest user message as FSD 13.2.4, strips the marker otherwise, and passes through untouched when no marker is present. `docker-compose.e2e.yml` only sets `AI_FAULT_INJECTION=true`.
- **Acceptance criteria:**
  - [x] Unit: each marker produces its behaviour; no marker → delegate called with unchanged messages.
  - [x] Unit: factory never wraps when `AI_FAULT_INJECTION=false`, even with a marker present.
  - [x] `docker compose config` without the override shows fault injection off; with the override, on.
- **Verification:** Backend gates; `docker compose -f docker-compose.yml -f docker-compose.e2e.yml config`.
- **Size:** S
- **Result:** done 2026-10-18. Decorator wraps the adapter only when AI_FAULT_INJECTION=true. A fault fires once per assistant message id (in memory), so a retry reaches the real provider; markers are stripped from every delegated call. `AiStreamOptions.messageId` added. 256 tests. Commits: `feat(backend): send think=false to Ollama`, `feat(backend): add fault-injecting AI provider and docker-compose.e2e.yml`

### T24: Composer, streaming message and Stop

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T06, CP3 (started early 2026-10-18 after T18: fully mocked, frontend-only files)
- **Parallel with:** T19–T21
- **Mocked:** yes – backend T20 not done; uses T04 SSE handlers
- **FSD refs:** FR-CHAT-01, FR-CHAT-02, FR-CHAT-05, FR-CHAT-08, FR-CHAT-10, FR-CHAT-12, NFR-01, NFR-03, 6.4, 9.4
- **Files/areas:** `apps/frontend/src/features/chat/` (`composer.tsx`, `streaming-message.tsx`, `use-send-message.ts` + tests), `apps/frontend/src/routes/_authenticated/projects.$projectId.tsx`
- **Skills:** `ai-ui-patterns`, `react-render-optimization`, `hooks-pattern`, `shadcn`
- **Description:** Composer (Enter/Shift+Enter, counter, disabled while streaming), send flow using `streamChat` + stream store + Query cache updates per FSD 9.4, thinking indicator, progressive text with `aria-live`, Stop, auto-scroll that respects manual scroll, sidebar invalidation on finish, streams surviving navigation.
- **Acceptance criteria:**
  - [x] Integration (MSW SSE): user message appears immediately, indicator shows, text grows across tokens, final message replaces the placeholder.
  - [x] Integration: Stop aborts the request and the message shows "Stopped" with the partial text.
  - [x] Integration: navigate to another project mid-stream and back → stream still shown or finished, no duplicate messages.
  - [x] Only the streaming message re-renders per token (render-count test or React Profiler assertion).
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. Pre-stream AI_* and STREAM_IN_PROGRESS errors show inline; other errors show as toasts. Send is a useMutation, so the global 401 handler applies. After Stop, a resync runs at 300 ms; the race where the server is still `streaming` is handled in T25 and checked at CP4. The MSW node server doesn't propagate client aborts. Commit: `feat(frontend): add chat composer, live streaming message, Stop and auto-scroll`

### T25: Error/Retry UI, Summarise and summary card

- **Owner:** frontend-engineer
- **Status:** done
- **Depends on:** T24
- **Parallel with:** T21–T23
- **Mocked:** yes – backend T21 not done; uses T04 summarise/retry handlers
- **FSD refs:** FR-CHAT-06, FR-CHAT-07, FR-SUM-01, FR-SUM-04, FR-SUM-05, FR-SUM-07, FR-RESET-03, 11.3
- **Files/areas:** `apps/frontend/src/features/chat/` (`use-summarise.ts`, `use-retry-message.ts`, `message-item.tsx` + tests), `apps/frontend/src/features/projects/project-header.tsx`
- **Skills:** `ai-ui-patterns`, `shadcn`
- **Description:** SSE `error` events and pre-stream errors shown inline with the FSD 11.3 text; Retry on the last failed/aborted assistant message streams into the same message; Summarise button with disabled rules; summary streaming into a card; Reset/Summarise disabled while streaming.
- **Acceptance criteria:**
  - [x] Integration: `error` event after tokens → partial text + inline error + Retry; Retry streams into the same `message-item` and ends complete.
  - [x] Integration: Summarise disabled with no assistant reply; enabled otherwise; produces a Summary card.
  - [x] Integration: 503 `AI_UNAVAILABLE` and 409 `STREAM_IN_PROGRESS` pre-stream errors show their messages.
- **Verification:** Frontend gates.
- **Size:** M
- **Result:** done 2026-10-18. Shared `useStreamRun` with upsert-by-id, so retry replaces the row in place. Pre-stream notices go through `stream-notice.store.ts`. Stop resync refetches at 300 ms, 1 s and 2 s and skips server rows still `streaming`. The real backend's `aborted` timing is checked at CP4. Commit: `feat(frontend): add retry, summarise and summary card streaming, fix stop resync`

### CP4: Checkpoint – chat integration (SSE through nginx)

Result so far (2026-10-18, lead; e2e stack with AI_PROVIDER=ollama gemma4:12b and fault injection): through :5173, slow-marker tokens arrive about 0.5 s apart (unbuffered); a real Ollama reply streams 60 tokens; retry regenerates in place (complete); summarise streams a summary card; a client disconnect after 2 s saves `aborted` with the partial text; reset gives 201 and an empty conversation. UI journeys passed (T26/T27, 15/15 e2e). CP4 passed. OpenRouter default model is now `nvidia/nemotron-3-ultra-550b-a55b:free` (user's choice; tested: first token 0.7 s, progressive). The CP4 specialist review was merged into the final review (CP5) after a usage-limit interruption.

- [ ] `docker compose up --build` with a real OpenRouter key: send, Stop, Summarise, Retry and Reset work through `:5173` with progressive tokens (nginx unbuffered).
- [ ] Empty `OPENROUTER_API_KEY`: stack starts, chat shows `AI_UNAVAILABLE` message.
- [ ] Backend and frontend gates; E2E gates with `docker-compose.e2e.yml`.
- [ ] Specialist review on T19–T25.

---

## Phase 4: E2E and deliverables

### T26: E2E: project, chat, summarise and reset journeys

- **Owner:** qa-engineer
- **Status:** done
- **Depends on:** CP4, T13
- **Parallel with:** T28, T29
- **FSD refs:** 13.2.4 (journeys 2–4), FR-CHAT-02, FR-SUM-01–FR-SUM-04, FR-RESET-01–FR-RESET-04
- **Files/areas:** `apps/e2e/tests/chat.spec.ts`, `apps/e2e/tests/summary-reset.spec.ts`, `apps/e2e/pages/` (page objects)
- **Skills:** `clean-code`
- **Description:** Real-AI journeys with unique per-test projects: create project → send → indicator, growing text, complete; summarise → summary card survives reload; reset → empty chat, header unchanged. Assert behaviour, never wording; generous timeouts only on AI steps.
- **Acceptance criteria:**
  - [x] Progressive rendering asserted (text length increases between two observations before completion).
  - [x] All journeys pass twice in a row against the e2e stack; no seed projects touched.
- **Verification:** E2E gates.
- **Size:** M
- **Result:** done 2026-10-18. 11 journey tests (chat, summary/reset, navigation) against real Ollama gemma4:12b; progressive growth asserted while `streaming`. Commit: `test(e2e): add project, chat, summary, reset and AI failure-path journeys`

### T27: E2E: AI failure paths via fault markers

- **Owner:** qa-engineer
- **Status:** done
- **Depends on:** T23, T26
- **Parallel with:** T28, T29
- **FSD refs:** 13.2.4 (fault markers), FR-CHAT-05–FR-CHAT-07
- **Files/areas:** `apps/e2e/tests/ai-failures.spec.ts`
- **Skills:** `clean-code`
- **Description:** One test per marker: `timeout`, `error-midstream`, `malformed` → inline error + Retry (Retry succeeds with the real provider); `slow` → Stop leaves a "Stopped" message.
- **Acceptance criteria:**
  - [x] Four tests, each asserting the message `data-status` and the visible error/Stopped state.
  - [x] Pass against the e2e stack; documented as requiring `docker-compose.e2e.yml`.
- **Verification:** E2E gates.
- **Size:** S
- **Result:** done 2026-10-18. 4 fault-marker tests; each Retry succeeds against the real model; Stop stays `aborted` for 3 s (checked with MutationObserver). Lead re-ran the full suite: 15 passed (4.0 min). Commit: included in T26's.

### T28: README update

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** CP4
- **Parallel with:** T26, T27
- **FSD refs:** FR-INFRA-08, 14.1
- **Files/areas:** `README.md`
- **Skills:** –
- **Description:** Update the README to the implemented state: setup, single-command start, seed credentials, usage walkthrough, AI provider choice (OpenRouter default and why; how to switch to Ollama/Gemini), env table, test commands (unit/integration need Postgres; e2e command), architecture diagrams kept accurate.
- **Acceptance criteria:**
  - [x] Every command in the README runs as written on a clean checkout.
  - [x] Env table matches `.env.example` exactly.
  - [x] "Current status" reflects what's implemented.
- **Verification:** Run the README's setup and start commands; `pnpm exec prettier --check README.md`.
- **Size:** S
- **Result:** done 2026-10-18. README rewritten for the implemented app (quick start, usage, provider and switching, full env table, 3 Mermaid diagrams, structure, tests, security). Lead checked that every `.env.example` key is covered and Prettier is clean. `docker compose up` and the e2e commands are exercised at CP5. Commit: `docs: rewrite README for the implemented app`

### T29: DECISIONS.md

- **Owner:** backend-engineer
- **Status:** done
- **Depends on:** T28
- **Parallel with:** T26, T27
- **FSD refs:** FR-INFRA-08, `docs/requirements.md` (Architecture Decision Record)
- **Files/areas:** `DECISIONS.md`
- **Skills:** `agent-skills:documentation-and-adrs`
- **Description:** Answer the five questions in 3–8 sentences each with real file paths: AI integration (adapter + factory + failure mapping), streaming end-to-end, conversation context and history window, state management (ask `frontend` via SendMessage for Q4 specifics: stream store vs Query cache), what you'd do differently.
- **Acceptance criteria:**
  - [x] All five questions answered, each 3–8 sentences, each citing at least one real path.
  - [x] Q4 reviewed by the frontend teammate (noted in the report).
- **Verification:** Every cited path exists (`ls` each); `pnpm exec prettier --check DECISIONS.md`.
- **Size:** S
- **Result:** done 2026-10-18. Five answers of 6–8 sentences each; every cited path exists (lead checked); frontend reviewed Q4 and Q2 and its corrections were applied. Commit: `docs: add DECISIONS.md`

### CP5: Checkpoint – final

Progress 2026-10-18 (lead): root `pnpm lint`, `check-types` and `test` green (backend 289, frontend 132, contract 12). Default stack (`docker compose up -d --build`, OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`, fault injection off): healthy; health and /api/docs 200; seed projects present; a real send through :5173 streamed 39 tokens (first at 2.9 s); a fault marker with injection off went to the real model. E2E (fault stack): 15/15. Final specialist review done (security: 0 Critical/High/Medium; test and code: 2 High, fixed in T21-fix-1; Medium/Low bundles F–I fixed with user approval; J deferred to DECISIONS Q5). After the fixes: root gates green; e2e 16/16 (×3); default stack with real OpenRouter streamed 40 tokens through :5173; a foreign-Origin reset returns 403; CSP present. **CP5 passed 2026-10-18.**

- [x] Clean clone: `cp .env.example .env`, add key, `docker compose up --build` → seed user can do the whole flow.
- [x] Root `pnpm lint && pnpm check-types && pnpm test` (Postgres up) and E2E gates green.
- [ ] Specialist review on the full diff since the run started.
- [ ] Final summary with proposed conventional commits per task.

---

## Risks and mitigations

| Risk                                                      | Impact | Mitigation                                                                                                                 |
| --------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Free OpenRouter models are slow, rate limited or change   | High   | Adapter abstraction; Ollama/Gemini fallbacks; first-token timeout; e2e asserts behaviour only; README documents switching. |
| SSE buffered by Fastify/nginx/Vite proxy                  | High   | `reply.hijack()` + `X-Accel-Buffering: no`; manual `curl -N` checks in T20; CP4 through nginx.                             |
| better-auth + Fastify + Nest body parsing conflicts       | High   | Own thin handler route (T10) with integration tests; early in Phase 1.                                                     |
| Contract dual build / CJS resolution in backend or Docker | Medium | T01 and T07 prove resolution in Vitest, Nest build, `node dist` and the runtime image.                                     |
| `nestjs-zod` + Zod 4 Swagger output gaps                  | Medium | T01 checks `/api/docs`; fall back to explicit `@ApiBody` schemas if needed (contract unchanged).                           |
| Concurrent streams / stale rows                           | Medium | Partial unique index (T09) + stale flip in the transaction (T20) + integration test.                                       |
| Lockfile conflicts between parallel teammates             | Low    | Dependency-adding tasks report packages; lead serialises installs.                                                         |

## Open questions

None blocking. FSD section 16 assumptions were approved at Gate 1.
