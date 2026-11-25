# Brain Gym

Deliberate-practice training app for reasoning. Three modes (memo extraction, technical incident response, LSAT logical reasoning). Single-user deployment with a shared-password login. See `START_HERE.md` for the product spec and `docs/superpowers/specs/` for the implementation design.

## Run locally

Prereqs: Node 22+ (CI and Docker use 22), Corepack, Docker. The repository pins pnpm 9.12.3.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# edit .env: set OPENAI_API_KEY, APP_PASSWORD, and a random SESSION_SECRET
# generate SESSION_SECRET with: openssl rand -hex 32
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000.

Postgres listens on host port **5438** to avoid clashing with other local Postgres containers; if you want the standard 5432 instead, edit `docker-compose.yml` and the `DATABASE_URL` in `.env`.

The database runs the `pgvector/pgvector:pg16` image (Postgres 16 + the `pgvector`
extension) so semantic duplicate prevention can store problem embeddings. If you
are upgrading from `postgres:16-alpine`, back up the database first and use the
pgvector-enabled image with the existing PostgreSQL 16 volume. Do not delete the
volume to fix an extension error; see [operations](docs/operations.md).

## Deploy with Docker

Run the whole stack (Next.js + Postgres) in containers with a single command. Useful for a small VPS or home server fronted by NGINX or Cloudflare Tunnel.

Prereqs: Docker + Docker Compose.

```bash
cp .env.example .env
# edit .env: set OPENAI_API_KEY, APP_PASSWORD, and a random SESSION_SECRET
docker compose up -d --build
```

The app binds to `127.0.0.1:${APP_PORT:-3111}`. Point your HTTPS reverse proxy at that port. Production session cookies require HTTPS; plain HTTP is only suitable for the readiness probe. The container handles `prisma migrate deploy` on every start and transactionally fills missing seed data on every start while preserving existing prompts and metadata.

| Task | Command |
|---|---|
| Tail logs | `docker compose logs -f app` |
| Restart app only | `docker compose restart app` |
| Stop everything | `docker compose down` |
| Update after `git pull` | `docker compose up -d --build` |
| Reset DB (destructive) | `docker compose down -v` |

### Production checklist

- **Terminate HTTPS in front of the container.** The login is a single shared password; never expose port `${APP_PORT}` directly to the public internet without TLS.
- **Change `APP_PASSWORD` and `SESSION_SECRET`** in `.env`; use `openssl rand -hex 32` for the secret. Never deploy the example credentials. Login failures are limited to 10 per minute per process.
- **Postgres is bound to `127.0.0.1:5438`** so it's reachable from the host (for `psql`, `prisma studio`) but never from the public interface. Don't change this unless you know what you're doing.
- **Set `APP_PORT`** in `.env` if `3111` clashes with something else on the host.

### Host dev and Docker side-by-side

The same `.env` file works for both: when you run `pnpm dev`, the app reads `DATABASE_URL` and connects to Postgres on `localhost:5438`. When you run `docker compose up`, compose overrides `DATABASE_URL` to point at the `db` service on the internal network. You don't need two env files.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Offline unit and grading regression tests; no database or API key needed |
| `pnpm eval` | Deterministic grading scenarios (mocked model responses) |
| `pnpm test:integration` | Real PostgreSQL/pgvector tests; requires explicit `TEST_DATABASE_URL` |
| `pnpm check` | Lint, TypeScript, and offline tests |
| `pnpm test:smoke` | Built-server HTTP and all-mode workflow checks against explicit `TEST_DATABASE_URL` |
| `pnpm test:restart` | Real process-kill/restart recovery checks against explicit `TEST_DATABASE_URL` |
| `pnpm test:browser` | Chromium interaction and draft/retry recovery checks against explicit `TEST_DATABASE_URL` |
| `pnpm eval:live` | Six opt-in billable quality checks; no DB access |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:up` / `pnpm db:down` | Postgres in Docker |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Initialize missing user, exercise types, and prompts without rewriting existing rows |
| `pnpm db:studio` | Prisma Studio GUI |
| `pnpm db:reset` | Drop + recreate + reseed (destructive) |

## Env

See `.env.example`. Required: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOCAL_USER_ID`, `APP_PASSWORD`, `SESSION_SECRET` (32+ characters).

Optional (semantic dedup, with defaults): `EMBEDDING_MODEL` (`text-embedding-3-small`),
`DEDUP_SIMILARITY_THRESHOLD` (`0.85`), `DEDUP_MAX_RETRIES` (`3`), `DEDUP_NEIGHBOR_K` (`5`).
Also optional: `OPENAI_TIMEOUT_MS` (`1200000`, i.e. 20 min per attempt; the client makes
up to 2 attempts per model call — raise it if high reasoning effort regularly times out).

## Structure

- `app/` — Next.js App Router pages + API routes
- `components/` — UI (shadcn primitives in `components/ui/`)
- `lib/` — config, db client, OpenAI wrapper, per-exercise modes, prompt registry, memory helpers
- `prisma/` — schema, migrations, seed
- `prompts/` — source-of-truth prompt files (seeded into DB)
- `tests/` — Vitest unit + integration
- `docs/superpowers/` — design + plan documents

## Adding a fourth exercise mode

1. Add an enum value to `ExerciseSlug` in `prisma/schema.prisma`, migrate.
2. Add seed rows in `prisma/seed.ts` and prompt files in `prompts/`.
3. Create `lib/exercises/<mode>/{schemas,generator,evaluator,index}.ts` following the existing modes.
4. Register in `lib/exercises/registry.ts`.
5. Add a tab in `components/today/exercise-picker.tsx`.

## Duplicate prevention

Two layers stop repeated problems:

1. **Exact hash** — a SHA-256 over the normalized title, prompt start, and tags
   (`lib/memory/uniqueness.ts`), enforced by a unique constraint per exercise type.
2. **Semantic gate** — each generated problem is embedded (OpenAI
   `text-embedding-3-small`) and compared by cosine similarity against prior
   problems of the same type via `pgvector` (`lib/memory/similarity.ts`). If the
   nearest prior problem is at or above `DEDUP_SIMILARITY_THRESHOLD`, generation
   retries (up to `DEDUP_MAX_RETRIES`), feeding the colliding problems back as
   things to avoid. If every retry is still too similar, the least-similar
   candidate is saved and flagged `near-dup` (visible in History and
   `/admin/problems`).

Embedding failures never block generation: a problem still saves, just without an
embedding (and so without the semantic check for that one).

## Troubleshooting

- **Prisma can't connect:** confirm `docker compose ps` shows the `brain_gym_db` container healthy, and `.env` `DATABASE_URL` matches `docker-compose.yml` creds + port.
- **Integration tests fail with "no active prompt":** run `pnpm db:seed`.
- **OpenAI 400 on `web_search`:** your account may not have the tool enabled; remove the `tools` block in the affected generator temporarily.
- **Migration fails with "type vector does not exist":** confirm the database uses the
  `pgvector/pgvector:pg16` image and that an administrator can run
  `CREATE EXTENSION IF NOT EXISTS vector;`. Preserve the data volume.

## Verification and operations

See [testing and grading evals](docs/testing.md) for isolated database setup and
what the evals prove. [Operations](docs/operations.md) covers Rocinante deployment,
backups, health checks, rollback, and interrupted-work recovery.

The supported deployment is a **long-lived Node server**. A worker starts with
Next.js and claims durable PostgreSQL jobs using expiring leases. Accepted work
survives restarts; completed model responses and selected results are checkpointed
before application persistence. Ownership checks prevent stale workers from
committing after lease takeover, and concurrency limits are database-wide.
Serverless execution still needs a separate always-on worker. See
[durable jobs](docs/durable-jobs.md) for guarantees and the provider-response
persistence boundary. Live model quality remains separate from fixture tests.

For opt-in checks against a real model, `pnpm eval:live --dry-run` previews the
six default cases. `pnpm eval:live --lsat-generation --repeats 3` adds repeated
checks plus an independent blind review of generated LSAT keys. Live runs incur
API usage and save reports; they never access the application database. See
[model quality](docs/model-quality.md) for limits and evidence review.

## Reliability behavior

Answers are saved as per-problem drafts in this browser until submission, including
LSAT position and the original start time. Reloading or signing back in resumes
the exercise; elapsed time includes time away. The generated problem URL is
bookmarkable. Browser storage failures show a warning without preventing editing.
Drafts remain on this browser until successful submission or browser storage is
cleared; they are not synced between devices.

Each draft has a stable submission ID. Retrying after a lost response returns the
same saved attempt; reusing an ID with different content returns a conflict.
Generation and evaluation each allow at most two queued/running jobs across worker processes. Short transient
database failures retry persistence without repeating the model call.

Memo/incident overall grades are calculated from rubric points (earned / possible
× 10, rounded to one decimal). Existing historical grades are preserved. New
problems use fixed rubric names and score scales; blank/duplicate sections or
choices and unusable answer keys are rejected before saving. LSAT shuffling is
conservative when prose refers to answer labels or positions.

See [the reliability review](docs/reliability-review.md) for reproduced failures,
fixes, verification layers, and remaining limitations.
