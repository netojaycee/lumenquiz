#!/bin/sh
set -eu

cd /app/apps/backend

mkdir -p data uploads

if [ -d /app/seed-data ]; then
  cp -rn /app/seed-data/. data/ 2>/dev/null || true
fi

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Running PostgreSQL migrations..."
  pnpm exec prisma migrate deploy
fi

echo "Starting Apoquiz..."
exec "$@"
