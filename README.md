# lmesh CMF Assistant

A web application for automotive designers to create design projects and chat
with an AI assistant about design direction, colour-material-finish (CMF)
themes, and material choices, with the assistant kept aware of each project's
context (see `docs/requirements.md` for the full brief this project was built
against).

**Current status:** this is an early scaffold. The backend currently exposes
only a health check endpoint, a `User` Prisma model/migration, and a seed
script that creates a test user with a bcrypt-hashed password; there is no
authentication, project, or AI/chat module yet. The frontend currently has
only a single placeholder route. The product features described above are
the target scope (see `docs/requirements.md`), not yet implemented.

## Repo structure

This is a [Turborepo](https://turborepo.dev) monorepo managed with pnpm workspaces.

- `apps/backend` — API server: NestJS 11 (Fastify adapter), Prisma, PostgreSQL.
- `apps/frontend` — SPA: React 19, TanStack Router, TanStack Query, Zustand, Tailwind CSS v4, served by Vite in dev and nginx in Docker.
- `packages/ui` — shared React UI component stubs (`Button`, `Card`, `Code`).
- `packages/eslint-config` — shared ESLint configurations.
- `packages/typescript-config` — shared `tsconfig.json` bases.

## Tech stack

- **Backend:** NestJS 11 + Fastify, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 17, class-validator, bcryptjs, Jest.
- **Frontend:** React 19, TanStack Router v1, TanStack Query v5, Zustand, Tailwind CSS v4, Radix UI, Vite, Vitest.
- **Tooling:** Turborepo, pnpm workspaces, ESLint, Prettier, TypeScript, Docker / Docker Compose.
- **AI provider config:** the backend's env schema (`AI_PROVIDER`: `ollama` | `openrouter` | `gemini`, plus related model/key vars) anticipates Ollama, OpenRouter, or Gemini, but no AI/chat module or LLM client is implemented yet.

## Prerequisites

- Node.js `>= 24` (root `package.json` `engines`)
- pnpm `11.25.0` (root `package.json` `packageManager`)
- Docker and Docker Compose, if you want to run the full stack via Compose

## Setup

Install dependencies from the repo root:

```sh
pnpm install
```

Copy the environment file templates:

```sh
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env   # optional, has working defaults
```

### Environment variables (root `.env`)

Used by Docker Compose and by the backend when run locally. Every variable has
a default (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `OLLAMA_PORT` | Host-side port mappings |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL credentials/database name |
| `DATABASE_URL` | Prisma/backend connection string (points at `localhost` for local dev; overridden to the `postgres` service inside Compose) |
| `NODE_ENV`, `HOST`, `PORT` | Backend runtime env, bind address/port |
| `CORS_ORIGIN` | Allowed browser origin for the API |
| `SEED_ON_START` | Runs the idempotent seed script on backend container start |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Validated at boot; reserved for auth (no JWT issuing/verification is implemented yet) |
| `AI_PROVIDER` | `ollama` \| `openrouter` \| `gemini` (validated at boot; no AI module consumes it yet) |
| `AI_REQUEST_TIMEOUT_MS`, `AI_HISTORY_MAX_MESSAGES` | AI call timeout and conversation history limit |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Ollama connection (defaults to the host machine) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | OpenRouter credentials/model |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini credentials/model |

The frontend's `apps/frontend/.env.example` additionally defines
`VITE_API_BASE_URL` (baked in at build time) and `VITE_DEV_API_PROXY_TARGET`
(dev-server proxy target for `/api`).

## Running locally (without Docker)

You need a reachable PostgreSQL instance (e.g. `docker compose up postgres`,
or your own local Postgres) matching `DATABASE_URL` in `.env`. Apply migrations
and seed the test user before starting the app for the first time:

```sh
pnpm --filter backend prisma:migrate:deploy
pnpm --filter backend db:seed
pnpm dev
```

`pnpm dev` runs `turbo run dev` for all apps:

- Backend: generates the Prisma client then starts NestJS in watch mode — API at `http://localhost:3000/api/v1`, Swagger UI at `http://localhost:3000/api/docs`.
- Frontend: Vite dev server at `http://localhost:5173`, proxying `/api` to the backend.

## Running with Docker Compose

```sh
docker compose up --build
```

Services (ports are host-side, from `.env`/`docker-compose.yml` defaults):

| Service | URL | Notes |
| --- | --- | --- |
| `frontend` | http://localhost:5173 | nginx serving the built SPA, proxies `/api` to `backend` |
| `backend` | http://localhost:3000/api/v1 | Swagger docs at `/api/docs`; runs Prisma migrations and the seed script on start |
| `postgres` | localhost:5432 | PostgreSQL 17 (Alpine) |
| `ollama` (optional) | localhost:11434 | Only started with `docker compose --profile ollama up`; set `OLLAMA_BASE_URL=http://ollama:11434` to use it |

On backend startup, pending Prisma migrations are applied and, if
`SEED_ON_START=true` (the default), the database is seeded with a test user:

```
test@lmesh.eu / password
```

## Other scripts

From the repo root (run via Turborepo across all apps/packages):

```sh
pnpm build         # turbo run build
pnpm lint           # turbo run lint
pnpm check-types    # turbo run check-types
pnpm test           # turbo run test
pnpm format         # prettier --write "**/*.{ts,tsx,md}"
```

Backend-specific (run from the repo root with `pnpm --filter backend <script>`):

```sh
pnpm --filter backend prisma:generate        # generate the Prisma client
pnpm --filter backend prisma:migrate         # create/apply a dev migration
pnpm --filter backend prisma:migrate:deploy  # apply pending migrations (used in Docker)
pnpm --filter backend db:seed                # run the idempotent seed script
pnpm --filter backend test:watch             # Jest in watch mode
```

Frontend-specific (run from the repo root with `pnpm --filter frontend <script>`):

```sh
pnpm --filter frontend preview     # preview the production build
pnpm --filter frontend test:watch  # Vitest in watch mode
```
