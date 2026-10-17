# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/backend/Dockerfile .

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.25.0
WORKDIR /repo

# ---------------------------------------------------------------------------
# Prune the monorepo to the backend and its workspace dependencies so that
# unrelated changes (e.g. frontend deps) don't bust the install layer.
FROM base AS prune
RUN npm install -g turbo@2.11.9
COPY . .
RUN turbo prune backend --docker

# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=backend

# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter backend

# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/ ./
COPY --from=build --chown=node:node /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build --chown=node:node /repo/apps/backend/prisma ./apps/backend/prisma
COPY --from=build --chown=node:node /repo/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY --chown=node:node apps/backend/docker-entrypoint.sh ./apps/backend/docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/repo/apps/backend/docker-entrypoint.sh"]
