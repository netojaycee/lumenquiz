#!/usr/bin/env bash
# Deploy Apoquiz on a VPS using a project-local pnpm and PM2.
#
# Typical manual usage on the server:
#   cd /apps/backend/afmQuiz
#   bash scripts/deploy-vps.sh
#
# Useful overrides:
#   PM2_NAME=afmQuiz-3220 bash scripts/deploy-vps.sh
#   PM2_USE_SUDO=0 bash scripts/deploy-vps.sh
#   SKIP_GIT_PULL=1 bash scripts/deploy-vps.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"
ENV_FILE="$BACKEND_DIR/.env"
PNPM_VERSION="${PNPM_VERSION:-9.15.9}"
PM2_NAME="${PM2_NAME:-afmQuiz-3220}"
PM2_USE_SUDO="${PM2_USE_SUDO:-1}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"

cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.example and set APP_MODE=cloud, PORT, DATABASE_URL, PUBLIC_URL, and secrets."
  exit 1
fi

echo "==> Loading backend environment"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${APP_MODE:-}" != "cloud" ]]; then
  echo "APP_MODE must be cloud in $ENV_FILE for VPS deployment."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is missing in $ENV_FILE."
  exit 1
fi

echo "==> Installing project-local pnpm $PNPM_VERSION"
npm install \
  --prefix "$ROOT_DIR/.deploy-tools" \
  --no-save \
  --package-lock=false \
  "pnpm@$PNPM_VERSION"

export PATH="$ROOT_DIR/.deploy-tools/node_modules/.bin:$PATH"

echo "==> pnpm version: $(pnpm -v)"

if [[ "$SKIP_GIT_PULL" != "1" ]]; then
  echo "==> Pulling latest code"
  git pull
fi

echo "==> Building web app and backend"
bash "$ROOT_DIR/scripts/build-web.sh"

echo "==> Running Prisma migrations"
cd "$BACKEND_DIR"
pnpm exec prisma migrate deploy

echo "==> Restarting PM2 process: $PM2_NAME"
if [[ "$PM2_USE_SUDO" == "1" ]]; then
  if sudo pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    sudo pm2 restart "$PM2_NAME" --update-env
  else
    sudo pm2 start dist/main.js --name "$PM2_NAME"
  fi
  sudo pm2 save
else
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" --update-env
  else
    pm2 start dist/main.js --name "$PM2_NAME"
  fi
  pm2 save
fi

echo "==> Deployment complete"
echo "Check locally with: curl http://localhost:${PORT:-3220}/api/network/info"
