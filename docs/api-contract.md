# API Contract

Human-readable version of `packages/api-contract` (`@lmesh/api-contract`). The Zod schemas in that package are authoritative; this document and the package are updated together by the Tech Lead. Engineers import from the package and never edit it. Behaviour behind each endpoint is specified in `docs/functional-specification.md` (FSD); section numbers below refer to it.

## 1. Package

| Module             | Exports                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.ts`        | `IdSchema` (UUID), `TimestampSchema` (ISO 8601)                                                                                                 |
| `limits.ts`        | `PROJECT_TITLE_MAX = 120`, `PROJECT_DESCRIPTION_MAX = 2000`, `MESSAGE_CONTENT_MAX = 4000`                                                       |
| `error-codes.ts`   | `ErrorCode` (const object + union type), `ErrorCodeSchema`                                                                                      |
| `envelopes.ts`     | `successEnvelope(schema)`, `SuccessEnvelope<T>`, `ErrorEnvelopeSchema`, `ErrorEnvelope`                                                         |
| `health.ts`        | `HealthSchema`, `Health`                                                                                                                        |
| `projects.ts`      | `ProjectSchema`, `ProjectListSchema`, `CreateProjectRequestSchema`, `UpdateProjectRequestSchema`, `ProjectIdParamsSchema` and types             |
| `messages.ts`      | `MessageSchema`, `MessageRoleSchema`, `MessageKindSchema`, `MessageStatusSchema`, `SendMessageRequestSchema`, `MessageIdParamsSchema` and types |
| `conversations.ts` | `ActiveConversationSchema`, `ActiveConversation`                                                                                                |
| `sse.ts`           | `SseEventType`, `SseEventSchema` (discriminated union on `type`), one schema + type per event                                                   |
| `endpoints.ts`     | `endpoints` map (method, path, auth, stream), `EndpointName`, `buildPath(path, params)`                                                         |

Build: `tsup` → `dist/index.js` (ESM, frontend) and `dist/index.cjs` (CJS, backend) with declarations. Checks: `pnpm --filter @lmesh/api-contract lint && pnpm --filter @lmesh/api-contract check-types && pnpm --filter @lmesh/api-contract test && pnpm --filter @lmesh/api-contract build`.

Usage:

- **Backend**: `class CreateProjectDto extends createZodDto(CreateProjectRequestSchema) {}` (`nestjs-zod`); the global Zod pipe maps issues to `400 VALIDATION_FAILED` with `errors` keyed by field path. Exceptions carry `ErrorCode` values from this package.
- **Frontend**: the API client parses every success `data` with the matching schema and every error body with `ErrorEnvelopeSchema`; the SSE reader parses each event with `SseEventSchema`. MSW handlers and fixtures are typed from these exports.

## 2. Conventions (FSD 7.1)

- Base URL `/api/v1` (browser: relative, same origin via nginx or the Vite proxy). Auth is the better-auth session cookie; no `Authorization` header.
- Success: `{ data: T, message?: string, code?: string }`. Error: `{ message: string, code: ErrorCode, errors?: Record<string, string[]> }`.
- Exceptions: `/auth/*` returns raw better-auth responses; streaming endpoints return `text/event-stream` after the stream starts (JSON errors before); `DELETE` returns `204` without a body.
- Ownership failures return `404 NOT_FOUND`.

## 3. Endpoints

| Name (`endpoints.*`)    | Method and path                                 | Body                                | Success `data`                                 | Errors                                                                                         |
| ----------------------- | ----------------------------------------------- | ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `health`                | `GET /health`                                   | –                                   | `Health`                                       | `503 DATABASE_UNAVAILABLE`                                                                     |
| `signIn`                | `POST /auth/sign-in/email`                      | `{ email, password }` (better-auth) | raw better-auth `{ user, ... }` + `Set-Cookie` | better-auth 401, 429                                                                           |
| `signOut`               | `POST /auth/sign-out`                           | –                                   | raw better-auth                                | –                                                                                              |
| `getSession`            | `GET /auth/get-session`                         | –                                   | raw better-auth `{ session, user }` or `null`  | –                                                                                              |
| `listProjects`          | `GET /projects`                                 | –                                   | `Project[]` (by `updatedAt` desc)              | 401                                                                                            |
| `createProject`         | `POST /projects`                                | `CreateProjectRequest`              | `Project` (201)                                | 400 `VALIDATION_FAILED`, 401                                                                   |
| `getProject`            | `GET /projects/:projectId`                      | –                                   | `Project`                                      | 401, 404                                                                                       |
| `updateProject`         | `PATCH /projects/:projectId`                    | `UpdateProjectRequest`              | `Project`                                      | 400, 401, 404                                                                                  |
| `deleteProject`         | `DELETE /projects/:projectId`                   | –                                   | – (204)                                        | 401, 404, 409 `STREAM_IN_PROGRESS`                                                             |
| `getActiveConversation` | `GET /projects/:projectId/conversations/active` | –                                   | `ActiveConversation`                           | 401, 404                                                                                       |
| `resetConversation`     | `POST /projects/:projectId/conversations`       | –                                   | `ActiveConversation` (201, `messages: []`)     | 401, 404, 409 `STREAM_IN_PROGRESS`                                                             |
| `sendMessage` (stream)  | `POST /projects/:projectId/messages`            | `SendMessageRequest`                | SSE (section 5)                                | pre-stream: 400, 401, 404, 409 `STREAM_IN_PROGRESS`, 503 `AI_UNAVAILABLE`                      |
| `summarise` (stream)    | `POST /projects/:projectId/summaries`           | –                                   | SSE                                            | pre-stream: 401, 404, 409 `STREAM_IN_PROGRESS` / `NOTHING_TO_SUMMARISE`, 503 `AI_UNAVAILABLE`  |
| `retryMessage` (stream) | `POST /messages/:messageId/retry`               | –                                   | SSE                                            | pre-stream: 401, 404, 409 `MESSAGE_NOT_RETRYABLE` / `STREAM_IN_PROGRESS`, 503 `AI_UNAVAILABLE` |

`POST /auth/sign-up/email` exists in better-auth but is disabled and always rejected.

## 4. Schemas

| Schema                 | Fields                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project`              | `id: uuid`, `title: string`, `description: string \| null`, `createdAt`, `updatedAt`                                                                                                                                         |
| `CreateProjectRequest` | `title: string` (trimmed, 1–120), `description?: string \| null` (trimmed, ≤ 2000; `""` is stored as `null`)                                                                                                                 |
| `UpdateProjectRequest` | `title?`, `description?` (same rules); at least one present                                                                                                                                                                  |
| `Message`              | `id`, `conversationId`, `role: "user" \| "assistant"`, `kind: "chat" \| "summary"`, `content: string`, `status: "streaming" \| "complete" \| "error" \| "aborted"`, `errorCode: ErrorCode \| null`, `createdAt`, `updatedAt` |
| `SendMessageRequest`   | `content: string` (trimmed, 1–4000)                                                                                                                                                                                          |
| `ActiveConversation`   | `id`, `projectId`, `createdAt`, `messages: Message[]` (ascending)                                                                                                                                                            |
| `Health`               | `status: "ok"`, `database: "up"`, `uptime: number`, `timestamp`                                                                                                                                                              |
| `ErrorEnvelope`        | `message: string`, `code: ErrorCode`, `errors?: Record<string, string[]>`                                                                                                                                                    |

Invariants (FSD 8.2): user messages are `kind: chat`, `status: complete`, `errorCode: null`; `errorCode` is set if and only if `status: error`.

## 5. SSE events (FSD 9)

Response headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. Each event is `event: <type>\ndata: <json>\n\n`. Heartbeat: comment line `: ping` every 15 s.

| `type`            | Payload                                                       | Order                                                                                                    |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `message.created` | `{ userMessage: Message \| null, assistantMessage: Message }` | first; `userMessage` null for summarise and retry; `assistantMessage.status = streaming`, `content = ""` |
| `token`           | `{ messageId, delta: string (non-empty) }`                    | zero or more                                                                                             |
| `done`            | `{ message: Message }` (`status = complete`)                  | last on success                                                                                          |
| `error`           | `{ messageId, code: ErrorCode, message: string }`             | last on failure; message already saved as `status = error`                                               |

Client abort closes the connection; there is no final event and the server saves `status = aborted`.

## 6. Error codes

| Code                                                                              | Where                                 |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| `BAD_REQUEST`, `VALIDATION_FAILED`                                                | 400                                   |
| `UNAUTHORIZED`                                                                    | 401                                   |
| `FORBIDDEN`                                                                       | 403 (reserved)                        |
| `NOT_FOUND`                                                                       | 404                                   |
| `CONFLICT`, `STREAM_IN_PROGRESS`, `MESSAGE_NOT_RETRYABLE`, `NOTHING_TO_SUMMARISE` | 409                                   |
| `TOO_MANY_REQUESTS`                                                               | 429                                   |
| `SERVICE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`                                     | 503                                   |
| `AI_UNAVAILABLE`                                                                  | 503 pre-stream, or SSE `error`        |
| `AI_TIMEOUT`, `AI_PROVIDER_ERROR`, `AI_BAD_RESPONSE`                              | SSE `error` (and `Message.errorCode`) |
| `INTERNAL_ERROR`                                                                  | 500, or SSE `error`                   |
