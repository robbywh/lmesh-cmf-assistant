# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/frontend/Dockerfile -t frontend .

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.29-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Prune the monorepo down to the frontend and its workspace dependencies.
FROM base AS prepare
ARG TURBO_VERSION=2.11.9
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune frontend --docker

FROM base AS builder
# Install dependencies first so this layer is cached until the lockfile changes.
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
# Vite inlines VITE_* variables at build time, so they must be build args.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter frontend build

FROM nginx:${NGINX_VERSION} AS runner
ENV BACKEND_UPSTREAM=http://backend:3000
COPY apps/frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
