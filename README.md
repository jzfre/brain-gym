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
