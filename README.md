# Brain Gym

Deliberate-practice training app for reasoning. Three modes (memo extraction, technical incident response, LSAT logical reasoning). Local single-user MVP. See `START_HERE.md` for the product spec and `docs/superpowers/specs/` for the implementation design.

## Run locally

Prereqs: Node 20+, pnpm 9+, Docker.

```bash
pnpm install
cp .env.example .env
# edit .env: set OPENAI_API_KEY
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000.

Postgres listens on host port **5438** to avoid clashing with other local Postgres containers; if you want the standard 5432 instead, edit `docker-compose.yml` and the `DATABASE_URL` in `.env`.

## Deploy with Docker

Run the whole stack (Next.js + Postgres) in containers with a single command. Useful for a small VPS or home server fronted by NGINX or Cloudflare Tunnel.

Prereqs: Docker + Docker Compose.

```bash
cp .env.example .env
# edit .env: set OPENAI_API_KEY and APP_PASSWORD at minimum
docker compose up -d --build
```

Once it's up, the app is on `http://localhost:${APP_PORT:-3000}`. Point your reverse proxy at that port. The container handles `prisma migrate deploy` on every start and seeds the DB on first start only.

| Task | Command |
|---|---|
| Tail logs | `docker compose logs -f app` |
| Restart app only | `docker compose restart app` |
| Stop everything | `docker compose down` |
| Update after `git pull` | `docker compose up -d --build` |
| Reset DB (destructive) | `docker compose down -v` |

### Production checklist

- **Terminate HTTPS in front of the container.** The login is a single shared password; never expose port `${APP_PORT}` directly to the public internet without TLS.
- **Change `APP_PASSWORD`** in `.env` before opening up the host.
- **Postgres is bound to `127.0.0.1:5438`** so it's reachable from the host (for `psql`, `prisma studio`) but never from the public interface. Don't change this unless you know what you're doing.
- **Set `APP_PORT`** in `.env` if `3000` clashes with something else on the host.

### Host dev and Docker side-by-side

The same `.env` file works for both: when you run `pnpm dev`, the app reads `DATABASE_URL` and connects to Postgres on `localhost:5438`. When you run `docker compose up`, compose overrides `DATABASE_URL` to point at the `db` service on the internal network. You don't need two env files.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest (unit + integration, requires DB up + seeded for integration tests) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:up` / `pnpm db:down` | Postgres in Docker |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Reseed user, exercise types, prompts |
| `pnpm db:studio` | Prisma Studio GUI |
| `pnpm db:reset` | Drop + recreate + reseed (destructive) |

## Env

See `.env.example`. Required: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOCAL_USER_ID`.

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

## Troubleshooting

- **Prisma can't connect:** confirm `docker compose ps` shows the `brain_gym_db` container healthy, and `.env` `DATABASE_URL` matches `docker-compose.yml` creds + port.
- **Integration tests fail with "no active prompt":** run `pnpm db:seed`.
- **OpenAI 400 on `web_search`:** your account may not have the tool enabled; remove the `tools` block in the affected generator temporarily.
