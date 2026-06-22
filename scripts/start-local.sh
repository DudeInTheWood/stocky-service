#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST_DATABASE_URL="${HOST_DATABASE_URL:-postgresql://stock_watcher:stock_watcher@127.0.0.1:5432/stock_watcher?schema=public}"

echo "Starting local Postgres..."
docker compose up -d postgres

echo "Waiting for Postgres..."
for attempt in {1..30}; do
  if DATABASE_URL="$HOST_DATABASE_URL" npx prisma migrate status >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" == "30" ]]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi

  sleep 1
done

echo "Applying database migrations..."
DATABASE_URL="$HOST_DATABASE_URL" npm run prisma:deploy

echo "Starting stock watcher..."
docker compose up -d stock-watcher

echo "Local services are running:"
docker compose ps
