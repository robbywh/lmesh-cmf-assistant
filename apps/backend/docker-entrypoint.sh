#!/bin/sh
# Container start-up: apply pending migrations, optionally seed, then start the API.
set -e

cd /repo/apps/backend

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding database (idempotent)..."
  node dist/prisma/seed.js
fi

exec node dist/src/main.js
