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

# Seed only when the DB is empty (ExerciseType has zero rows). Protects any
# hand-edited prompts/exercise rows from being overwritten on every restart.
echo "[entrypoint] checking whether to seed..."
COUNT=$(node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.exerciseType.count()
  .then((n) => { process.stdout.write(String(n)); return p.$disconnect(); })
  .catch((e) => { console.error(e); process.exit(1); });
')

if [ "${COUNT}" = "0" ]; then
  echo "[entrypoint] empty DB, seeding..."
  tsx prisma/seed.ts
else
  echo "[entrypoint] DB already populated (${COUNT} exercise types), skipping seed"
fi

echo "[entrypoint] starting Next.js on :${PORT:-3000}"
exec node server.js
