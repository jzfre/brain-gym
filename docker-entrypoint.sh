#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "[entrypoint] waiting for ${DB_HOST}:${DB_PORT}..."
i=0
until nc -z "${DB_HOST}" "${DB_PORT}" 2>/dev/null; do
  i=$((i + 1))
  if [ "${i}" -ge 60 ]; then
    echo "[entrypoint] db not reachable after 60s, giving up" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] db reachable"

echo "[entrypoint] applying migrations..."
prisma migrate deploy

# Repair partial initialization without mutating existing prompts or metadata.
# The seed is transactional and insert-only for existing installations.
echo "[entrypoint] ensuring required seed data exists..."
tsx prisma/seed.ts

echo "[entrypoint] starting Next.js on :${PORT:-3000}"
exec node server.js
