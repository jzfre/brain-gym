# Dockerize Brain Gym for single-box deploy

## Goal

`docker compose up -d --build` brings up the entire app (Next.js + Postgres) on a single host, listening on one configurable host port. The operator points NGINX or Cloudflare Tunnel at that port and goes live. No host-installed Node, no manual `prisma migrate`, no manual seed.

## Non-goals

- Horizontal scaling, multiple replicas, or load balancing.
- Managed-DB deploys (Neon, RDS, etc). Postgres ships in the same compose file.
- TLS termination inside the container. NGINX/Cloudflare in front handles that.
- Publishing the image to a registry. The host builds locally from source.

## Architecture

```
host :APP_PORT (default 3000) ─▶ app container (Next.js standalone, :3000)
                                    └─▶ db container (postgres:16-alpine, :5432)
                                          └─ volume: pgdata
host 127.0.0.1:5438 ─▶ db (dev-only access, not publicly exposed)
```

Two services in `docker-compose.yml`: `db` (existing, with one change) and `app` (new). They share a default compose network; the app reaches Postgres at `db:5432`.

## Image strategy

Single multi-stage `Dockerfile` at repo root, four stages:

1. **base** — `node:20-alpine`, enable pnpm via `corepack`, set workdir.
2. **deps** — copy `package.json` + `pnpm-lock.yaml` + `.npmrc`, run `pnpm install --frozen-lockfile`. Includes dev deps (needed for `next build` and `prisma generate`).
3. **builder** — copy source, run `pnpm prisma generate`, then `pnpm build`. Relies on `next.config.mjs` having `output: 'standalone'` so the build emits a self-contained `.next/standalone/server.js`.
4. **runner** — fresh `node:20-alpine`, non-root user. Copies only what's needed at runtime:
   - `.next/standalone/` → `/app`
   - `.next/static/` → `/app/.next/static`
   - `public/` → `/app/public`
   - `prisma/` (schema + migrations + seed) → `/app/prisma`
   - `prompts/` → `/app/prompts` (seed reads from here)
   - `node_modules/.prisma`, `node_modules/@prisma`, `node_modules/prisma` (Prisma client + engines + CLI for `migrate deploy`)
   - `node_modules/tsx` and its runtime deps (entrypoint runs `node_modules/.bin/tsx prisma/seed.ts`)
   - `docker-entrypoint.sh` → `/app/docker-entrypoint.sh`

   `CMD ["./docker-entrypoint.sh"]`, `EXPOSE 3000`.

Target image size: ~200MB. Standalone build is the key optimization — without it the runtime image would carry all of `node_modules`.

## Entrypoint script

`docker-entrypoint.sh` runs on every container start. Bash, `set -euo pipefail`:

1. Wait for Postgres to accept TCP connections on `db:5432` (loop `nc -z db 5432` with short sleep, max ~30s). Compose `depends_on: condition: service_healthy` makes this near-instant in practice, but the script handles the edge case where the healthcheck misses a moment.
2. `node_modules/.bin/prisma migrate deploy`. Applies any pending migrations. Safe to re-run. pnpm is NOT installed in the runner image — we invoke the prisma CLI binary directly.
3. **Seed-if-empty:** query `SELECT COUNT(*) FROM "ExerciseType"` via a tiny inline node script using the already-copied Prisma client. If zero, run `node_modules/.bin/tsx prisma/seed.ts`. This protects hand-edited v1 prompts in an already-populated DB.
4. `exec node server.js` — `exec` so signals (SIGTERM from `docker stop`) reach Next.js cleanly.

## Compose changes

`docker-compose.yml` gains an `app` service and one tightening on `db`:

```yaml
services:
  db:
    # unchanged except:
    ports:
      - "127.0.0.1:5438:5432"   # was "5438:5432" — bind to localhost only

  app:
    build: .
    container_name: brain_gym_app
    restart: unless-stopped
    env_file: .env
    environment:
      # Override .env so the same file works for host dev (5438) and container (5432)
      DATABASE_URL: "postgresql://brain:brain@db:5432/brain_gym?schema=public"
      NODE_ENV: production
    ports:
      - "${APP_PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy
```

The DB-port tightening was a pending todo (`todo.md` — "Lock down Docker Postgres before exposing the host"). Doing it here closes the gap before the host gets pointed at the public internet.

## Config changes

- `next.config.mjs`: add `output: 'standalone'`. No other changes — `reactStrictMode` stays.
- `.dockerignore`: exclude `node_modules`, `.next`, `.git`, `tests`, `docs`, `.env*`, `*.log`, `coverage`, `.vitest-cache`, `.idea`, `.vscode`, `pgdata`, `tsconfig.tsbuildinfo`.

## Env

`.env.example` gains one new var with a comment:

```
# Host port that the app container exposes. Point NGINX/Cloudflare at this.
APP_PORT=3000
```

`DATABASE_URL` stays as-is in `.env.example` (the localhost:5438 form for host dev). Compose overrides it for the container. This avoids forcing users to maintain two env files.

## README

`README.md` gains a "Deploy with Docker" section after the existing "Run locally" section. Covers:

1. Copy `.env.example` to `.env`, fill in `OPENAI_API_KEY` and `APP_PASSWORD`.
2. `docker compose up -d --build`.
3. App is on `http://localhost:3000` (or `$APP_PORT`). Point reverse proxy at it.
4. Logs: `docker compose logs -f app`. Stop: `docker compose down`. Update: `git pull && docker compose up -d --build`.
5. Note: HTTPS must be terminated by the reverse proxy. Don't expose the app's port directly to the internet — the login is currently a single shared password and needs TLS in transit.

The existing "Run locally" section stays. Host dev (`pnpm dev`) and containerized deploy coexist.

## Files

New:
- `Dockerfile`
- `docker-entrypoint.sh`
- `.dockerignore`
- `docs/superpowers/specs/2026-05-23-dockerize-app-design.md` (this doc)

Modified:
- `next.config.mjs` — add `output: 'standalone'`
- `docker-compose.yml` — add `app` service, bind `db` port to localhost
- `.env.example` — add `APP_PORT`
- `README.md` — add "Deploy with Docker" section

Unchanged:
- `prisma/seed.ts` — already upsert-based, idempotent. Entrypoint guards against unwanted re-seeds.
- All app code.

## Failure modes considered

- **DB unreachable on startup:** entrypoint loops on `nc -z db 5432` up to ~30s, then exits non-zero. Compose `restart: unless-stopped` retries.
- **Migration fails mid-deploy:** `prisma migrate deploy` exits non-zero, entrypoint propagates. Container restarts; if it's a genuine schema error, the operator sees it in `docker compose logs app` and fixes manually.
- **Seed runs against a populated DB:** prevented by the row-count check. If `ExerciseType` somehow ends up empty in a non-empty DB, the seed is upsert-based and idempotent for everything except v1 prompt content (which would overwrite hand edits — acceptable failure mode, vanishingly rare).
- **Build fails because dev deps weren't installed:** `deps` stage installs full deps, not `--prod`. `next build` and `prisma generate` work.
- **Standalone output missing files:** `next.config.mjs` must set `output: 'standalone'` AND the runner stage must explicitly copy `.next/static` and `public` (Next doesn't include them in the standalone bundle). Spec captures this; plan must test it.
- **`tsx` not available at runtime:** the runner stage explicitly copies `node_modules/tsx` from the builder.

## Verification

After implementation, the following must work from a clean checkout:

```bash
cp .env.example .env
# edit .env: set OPENAI_API_KEY and APP_PASSWORD
docker compose up -d --build
# wait ~30s for build + boot
curl -sI http://localhost:3000/login | head -1   # → HTTP/1.1 200 OK
docker compose logs app | grep -i "ready"        # Next.js ready message
docker compose down
docker compose up -d                             # second start: no re-seed, no errors
```

A second `up` on the same volume must not error and must not overwrite seeded prompts.
