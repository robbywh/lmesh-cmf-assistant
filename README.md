# lmesh CMF Assistant

A web application for automotive designers: create **design projects**, then
chat with an AI assistant about design direction, colour-material-finish (CMF)
themes and materials. The assistant knows each project's context, streams its
answers token by token, can **summarise the key design decisions**, and the
conversation can be **reset** without losing the project. The brief this was
built against is in [`docs/requirements.md`](docs/requirements.md); the
architecture answers are in [`DECISIONS.md`](DECISIONS.md).

## Current status

Everything in the brief is implemented and runs from `docker compose up`:

- Email/password sign-in with [better-auth](https://better-auth.com) (session cookie, no public sign-up, rate limited) and a seeded user.
- Design projects: list, create, edit, delete (title + optional description).
- Per-project chat with a real LLM, streamed over SSE, with **Stop**, **Retry**, a "thinking" indicator and inline errors for timeouts and provider failures.
- **Summarise** key decisions (streamed, saved as a summary card) and **Reset** conversation (the old one is archived).
- Swappable AI provider behind one interface: OpenRouter (default), Ollama, Gemini.
- Seed data: the login user plus three sample projects, one with a short conversation and a summary.
- Tests: backend unit and integration tests (Vitest, real Postgres), frontend component tests, and Playwright end-to-end tests.

## Quick start

Prerequisites: Docker with Docker Compose. (Node >= 24 and pnpm 11.25.0 are only needed to run the tests or develop without Docker.)

```sh
cp .env.example .env
```

Then edit `.env`:

1. Set `OPENROUTER_API_KEY` to a free key from [openrouter.ai](https://openrouter.ai/keys) (or switch to Ollama, see [AI provider](#ai-provider)).
2. Make sure `OPENROUTER_MODEL` in your own `.env` is `nvidia/nemotron-3-ultra-550b-a55b:free` (the default in `.env.example`). Docker Compose prefers the value in `.env`, so a `.env` copied from an older example may still name a retired model.
3. Replace the placeholder `BETTER_AUTH_SECRET` with a real one: `openssl rand -base64 48`. The app still starts with the placeholder, but the backend logs a warning, because anyone could forge sessions with a public secret.

```sh
docker compose up --build
```

Open <http://localhost:5173> and sign in with:

```
test@lmesh.eu / password
```

The backend applies database migrations and seeds the database on every start while `SEED_ON_START=true` (idempotent: existing sample projects are never overwritten, but a sample project you delete is recreated on the next start). The seed creates the login user and three sample projects: _Premium SUV interior: warm earth_ (with a short conversation and a summary), _Urban EV compact: recycled textiles_ and _Sports coupe: dark technical_.

| Service             | URL                              | Notes                                                                                          |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `frontend`          | <http://localhost:5173>          | nginx serving the built SPA; proxies `/api` to the backend, unbuffered so SSE streams live     |
| API docs (Swagger)  | <http://localhost:5173/api/docs> | Also at <http://localhost:3000/api/docs> (the backend port is bound to localhost only)         |
| `backend`           | <http://localhost:3000/api/v1>   | Runs migrations and the seed on start                                                          |
| `postgres`          | localhost:5432                   | PostgreSQL 17, bound to localhost only                                                         |
| `ollama` (optional) | localhost:11434                  | Only with `docker compose --profile ollama up`; then set `OLLAMA_BASE_URL=http://ollama:11434` |

## Using the app

1. **Sign in** with the seed user. Every page except the login needs a session; an expired session sends you back to the login.
2. **Projects**: the sidebar lists your projects, most recently active first. Use **New project** to give it a title (required, up to 120 characters) and an optional design context (up to 2000 characters), for example "warm earth tones, matte leather, premium SUV interior". Edit or delete a project from the header (deleting asks for confirmation).
3. **Chat**: type a question (Enter sends, Shift+Enter adds a line). A thinking indicator shows until the first token, then the answer streams in as Markdown. The assistant always receives the project's title and description.
4. **Stop**: while an answer streams the Send button becomes **Stop**. The partial answer is kept and marked as stopped.
5. **Retry**: if an answer failed (timeout, provider error, unreadable reply) or was stopped, **Retry** regenerates that same message in place.
6. **Summarise**: asks the assistant for the key decisions under the headings Design direction, Colours, Materials, Finishes and Open questions / next steps. It appears as a summary card and is kept in the conversation.
7. **Reset conversation**: archives the current conversation and starts an empty one. The project itself is unchanged.

While an answer is streaming, sending, summarising and resetting are disabled (the server also answers `409 STREAM_IN_PROGRESS`). A stream keeps running if you open another project and come back.

## AI provider

**OpenRouter is the default**, with the free model `nvidia/nemotron-3-ultra-550b-a55b:free`. It needs only a free API key (no local install, no credit card), works the same on any machine, and a hosted model streams quickly enough for a good demo. The integration sits behind a single interface (`apps/backend/src/ai/ai-provider.interface.ts`), so choosing another provider is configuration, not code. Ollama and Gemini adapters are included and tested.

Free OpenRouter models come and go (a previous default was retired while this was built). If the default stops working, pick a current one from <https://openrouter.ai/models?q=free> and set `OPENROUTER_MODEL` in `.env`.

To switch provider, set `AI_PROVIDER` and that provider's variables in `.env`, then `docker compose up -d --build backend`:

| `AI_PROVIDER` | Needs                                    | Notes                                                                                                                                                                                                     |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openrouter`  | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Default.                                                                                                                                                                                                  |
| `ollama`      | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`        | Fully local. From Docker Compose to an Ollama on your machine use `OLLAMA_BASE_URL=http://host.docker.internal:11434`. The backend sends `think: false`, so reasoning models start answering immediately. |
| `gemini`      | `GEMINI_API_KEY`, `GEMINI_MODEL`         | Key sent in a header, never in the URL.                                                                                                                                                                   |

If the selected provider is not configured, the app still starts and sending a message returns a clear `503 AI_UNAVAILABLE`.

## Environment variables

Documented in [`.env.example`](.env.example) (copy it to `.env`). Used by Docker Compose and by the backend when run locally. A test (`apps/backend/src/config/env-example.spec.ts`) keeps this table, the example file and the backend's env schema in sync. `CORS_ORIGIN` and `BETTER_AUTH_URL` are commented out in the example: Docker Compose then derives them from `FRONTEND_PORT`.

| Variable                    | Default in `.env.example`                     | Purpose                                                                                                                                                       |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_PORT`             | `5173`                                        | Host port of the web app                                                                                                                                      |
| `BACKEND_PORT`              | `3000`                                        | Host port of the API (bound to `127.0.0.1`)                                                                                                                   |
| `POSTGRES_PORT`             | `5432`                                        | Host port of PostgreSQL (bound to `127.0.0.1`)                                                                                                                |
| `OLLAMA_PORT`               | `11434`                                       | Host port of the optional Ollama container (bound to `127.0.0.1`)                                                                                             |
| `POSTGRES_USER`             | `lmesh`                                       | PostgreSQL user                                                                                                                                               |
| `POSTGRES_PASSWORD`         | `lmesh`                                       | PostgreSQL password (change for anything non-local)                                                                                                           |
| `POSTGRES_DB`               | `lmesh_cmf`                                   | PostgreSQL database name                                                                                                                                      |
| `DATABASE_URL`              | `postgresql://lmesh:lmesh@localhost:5432/...` | Backend and Prisma connection string for local development; Compose overrides it to the `postgres` service                                                    |
| `NODE_ENV`                  | `development`                                 | Backend runtime mode (Compose runs the backend as `production`)                                                                                               |
| `HOST`                      | `0.0.0.0`                                     | Interface the API binds to                                                                                                                                    |
| `PORT`                      | `3000`                                        | Port the API listens on                                                                                                                                       |
| `CORS_ORIGIN`               | _(commented out; `http://localhost:5173`)_    | Comma-separated allowed browser origins                                                                                                                       |
| `TRUST_PROXY`               | `1`                                           | Proxies trusted for the client IP used by rate limiting: a hop count (1 = the nginx in front), `true`/`false`, or a list of addresses/CIDRs                   |
| `SWAGGER_ENABLED`           | `true`                                        | Serve Swagger UI at `/api/docs`. Always on outside production; needs `true` in production. Set `false` to hide it on a public deployment                      |
| `SEED_ON_START`             | `true`                                        | Run the idempotent seed when the backend container starts. Set `false` for anything non-local                                                                 |
| `BETTER_AUTH_SECRET`        | placeholder                                   | better-auth signing secret, required, at least 32 characters. Generate with `openssl rand -base64 48`. The backend warns loudly if it is a public placeholder |
| `BETTER_AUTH_URL`           | _(commented out; `http://localhost:5173`)_    | Public origin of the web app (cookies are issued for it). `https://` makes the session cookie `Secure`                                                        |
| `AI_PROVIDER`               | `openrouter`                                  | `openrouter` \| `ollama` \| `gemini`                                                                                                                          |
| `AI_REQUEST_TIMEOUT_MS`     | `120000`                                      | Abort an AI call after this long (minimum 1000); the partial answer is kept                                                                                   |
| `AI_FIRST_TOKEN_TIMEOUT_MS` | `30000`                                       | Abort when no first token arrives within this time (minimum 1000)                                                                                             |
| `AI_HISTORY_MAX_MESSAGES`   | `20`                                          | Most recent messages sent to the model per call                                                                                                               |
| `AI_HISTORY_MAX_CHARS`      | `24000`                                       | Character budget for the history sent per call (minimum 1000)                                                                                                 |
| `AI_FAULT_INJECTION`        | `false`                                       | Test-only: reacts to `[[e2e-fault:...]]` markers in messages. Only `docker-compose.e2e.yml` turns it on; never enable it elsewhere                            |
| `OLLAMA_BASE_URL`           | `http://localhost:11434`                      | Ollama server URL                                                                                                                                             |
| `OLLAMA_MODEL`              | `llama3.2`                                    | Ollama model name                                                                                                                                             |
| `OPENROUTER_API_KEY`        | _(empty)_                                     | OpenRouter API key                                                                                                                                            |
| `OPENROUTER_MODEL`          | `nvidia/nemotron-3-ultra-550b-a55b:free`      | OpenRouter model id                                                                                                                                           |
| `GEMINI_API_KEY`            | _(empty)_                                     | Gemini API key                                                                                                                                                |
| `GEMINI_MODEL`              | `gemini-2.0-flash-lite`                       | Gemini model id                                                                                                                                               |

The frontend's [`apps/frontend/.env.example`](apps/frontend/.env.example) defines `VITE_API_BASE_URL` (baked in at build time), `VITE_DEV_API_PROXY_TARGET` (dev proxy target) and `VITE_API_MOCKING` (dev-only mock API).

## Architecture

```mermaid
flowchart LR
    Browser["Browser"]
    FE["nginx + React SPA<br/>:5173"]
    API["NestJS + Fastify<br/>/api/v1"]
    DB[("PostgreSQL<br/>via Prisma")]
    AI["AI provider<br/>OpenRouter / Ollama / Gemini"]

    Browser -->|"HTTP, same origin"| FE
    FE -->|"proxy /api, unbuffered<br/>session cookie"| API
    API -->|"Prisma"| DB
    API -->|"prompt + project context<br/>(fetch, streamed)"| AI
    AI -->|"streamed tokens"| API
    API -->|"SSE over POST"| FE
```

The browser only talks to nginx. The NestJS API is the single entry point: a global guard requires a session on every route except health and the auth routes, data is scoped to the signed-in user, and AI tokens are relayed to the browser over SSE as they arrive.

### Sign-in

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend SPA
    participant API as NestJS API
    participant DB as PostgreSQL

    User->>FE: email + password
    FE->>API: POST /api/v1/auth/sign-in/email
    API->>DB: verify credential account (better-auth)
    API-->>FE: 200 + Set-Cookie (HttpOnly, SameSite=Lax)
    FE->>API: later requests carry the cookie
    API->>DB: SessionGuard validates the session
    API-->>FE: data, or 401 UNAUTHORIZED
```

better-auth is mounted in NestJS under `/api/v1/auth/*` (`apps/backend/src/auth/`). There is no sign-up route; the seed provisions the only account.

### Streaming a reply

```mermaid
sequenceDiagram
    participant FE as Frontend (fetch + reader)
    participant API as ChatStreamService
    participant DB as PostgreSQL
    participant AI as AI provider

    FE->>API: POST /api/v1/projects/:id/messages
    API->>DB: save user message + streaming placeholder
    API-->>FE: SSE event message.created
    API->>AI: streamChat(prompt)
    loop each chunk
        AI-->>API: delta
        API-->>FE: SSE event token
    end
    API->>DB: save final content and status
    API-->>FE: SSE event done (or error)
```

Events are `message.created`, `token`, `done` and `error`, validated against the shared contract in `packages/api-contract`. If the browser disconnects (Stop, closed tab) the server saves the partial answer as `aborted`. Summarise (`POST /projects/:id/summaries`) and Retry (`POST /messages/:id/retry`) use the same stream.

## Project structure

```
apps/
  backend/                 NestJS 11 + Fastify, Prisma 7, PostgreSQL
    src/auth/              better-auth instance, /auth/* handler, SessionGuard, @CurrentUser
    src/projects/          projects CRUD (owner-scoped)
    src/conversations/     active conversation, reset, stale-stream recovery
    src/chat/              send / summarise / retry streams, prompts, history window, SSE writer (`*.util.ts`)
    src/ai/                AiProvider port, factory, OpenRouter / Ollama / Gemini adapters, fault injection
    src/common/            exceptions, Origin guard, global filter, response envelope, Zod validation pipe
    prisma/                schema, migrations, seed
    test/                  integration tests (real Postgres)
  frontend/                React 19 SPA
    src/features/auth/     login, session query, sign-out
    src/features/projects/ sidebar, project dialogs, queries
    src/features/chat/     message list, composer, SSE reader, stream hooks
    src/stores/            Zustand: in-flight stream, UI preferences
  e2e/                     Playwright tests against the running stack
packages/
  api-contract/            shared Zod schemas, types, error codes, SSE events
  eslint-config/, typescript-config/
```

API docs are generated from the code and served at <http://localhost:5173/api/docs>.

## Tests

```sh
pnpm install                    # once
docker compose up -d postgres   # the backend integration tests need only Postgres
pnpm test                       # unit + integration + component tests for every package
```

The backend integration tests use a separate `lmesh_cmf_test` database that is created and migrated automatically; no AI provider is needed (it is replaced by a scripted test double). Other root checks:

```sh
pnpm lint
pnpm check-types
```

**End-to-end** (Playwright, real browser, real stack with fault injection enabled so failures can be triggered with markers like `[[e2e-fault:timeout]]`):

```sh
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build -d
pnpm --filter e2e install:browsers     # once: installs Chromium
pnpm --filter e2e test:e2e
```

The sign-in endpoint is rate limited to 5 attempts per 60 seconds per IP, so wait a minute between repeated e2e runs. Real AI journeys use your configured provider; the fault markers never reach it.

## Security notes

- Published ports of the backend, PostgreSQL and Ollama are bound to `127.0.0.1`; only the web app port is exposed to the network. The backend trusts exactly one proxy hop (`TRUST_PROXY=1`) and nginx overwrites `X-Forwarded-For`, so clients cannot spoof the IP used for rate limiting.
- The session is an `HttpOnly`, `SameSite=Lax` cookie, `Secure` when `BETTER_AUTH_URL` is `https://`. Sign-in is rate limited (5 per minute per IP) and wrong credentials give one generic message.
- nginx sends a strict Content-Security-Policy (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a Referrer-Policy.
- State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) that carry an `Origin` header outside the allowed list (`CORS_ORIGIN` plus the `BETTER_AUTH_URL` origin) are rejected with `403 FORBIDDEN`, which closes CSRF for the cookie session.
- If the session lookup itself fails (for example the database is down) the API answers `503 SERVICE_UNAVAILABLE`, not `401`, so a backend outage never signs users out.
- AI output is rendered as Markdown with raw HTML disabled and images not rendered (a remote image would leak the reader's IP); provider error text is logged (truncated, key removed) but never sent to the browser.
- For anything non-local: set a real `BETTER_AUTH_SECRET`, change the database password, set `SEED_ON_START=false` (the seed user's password is public), and consider `SWAGGER_ENABLED=false`.

## Local development without Docker

Needs a reachable PostgreSQL matching `DATABASE_URL` (for example `docker compose up -d postgres`):

```sh
pnpm install
cp .env.example .env
pnpm --filter backend prisma:migrate:deploy
pnpm --filter backend db:seed
pnpm dev
```

`pnpm dev` starts the backend (NestJS watch mode, API on <http://localhost:3000/api/v1>) and the Vite dev server on <http://localhost:5173>, which proxies `/api` to the backend. Other scripts: `pnpm build`, `pnpm format`, `pnpm --filter backend prisma:migrate` (create a dev migration), `pnpm --filter backend test:watch`, `pnpm --filter frontend test:watch`.

Conventions (file naming, response envelopes, exceptions, logging) follow `docs/requirements.md`; design decisions and trade-offs are in [`DECISIONS.md`](DECISIONS.md).
