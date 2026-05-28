#!/usr/bin/env bash
# build-web.sh — run this on the Ubuntu server to build and deploy Apoquiz.
#
# Usage:
#   bash scripts/build-web.sh
#
# What it does:
#   1. Installs all workspace deps
#   2. Builds shared packages (game-engine, shared-types, socket-events)
#   3. Builds frontend as a static export → apps/frontend/out/
#   4. Copies the export into apps/backend/public/  (backend serves it)
#   5. Builds backend TypeScript → apps/backend/dist/
#
# After this, start with PM2:
#   cd apps/backend
#   pm2 start dist/main.js --name apoquiz \
#     --env APP_MODE=cloud \
#     --env DATABASE_URL="postgresql://..." \
#     --env NODE_ENV=production \
#     --env PORT=3000 \
#     --env PUBLIC_URL=https://yourdomain.com \
#     --env SESSION_SECRET=your-secret-here

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building shared packages"
pnpm --filter=@apoquiz/shared-types build
pnpm --filter=@apoquiz/socket-events build
pnpm --filter=@apoquiz/game-engine build

echo "==> Building frontend (static export)"
# NEXT_PUBLIC_API_URL="" → relative same-origin URLs so session cookies work correctly
STATIC_EXPORT=1 NEXT_PUBLIC_API_URL="" pnpm --filter=@apoquiz/frontend build

echo "==> Copying frontend static export → apps/backend/public/"
BACKEND_PUBLIC="$ROOT_DIR/apps/backend/public"
rm -rf "$BACKEND_PUBLIC"
cp -r "$ROOT_DIR/apps/frontend/out" "$BACKEND_PUBLIC"

echo "==> Generating Prisma client"
pnpm --filter=@apoquiz/backend prisma generate

echo "==> Building backend"
pnpm --filter=@apoquiz/backend build

echo ""
echo "Build complete. Start the server with PM2:"
echo ""
echo "  cd apps/backend"
echo "  APP_MODE=cloud \\"
echo "  DATABASE_URL='postgresql://user:pass@host:5432/apoquiz' \\"
echo "  NODE_ENV=production \\"
echo "  PORT=3000 \\"
echo "  PUBLIC_URL=https://quiz.johnedeh.com \\"
echo "  SESSION_SECRET=your-secret-here \\"
echo "  pm2 start dist/main.js --name apoquiz"
