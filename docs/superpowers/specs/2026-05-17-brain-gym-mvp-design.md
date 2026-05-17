# Brain Gym MVP — Design

Date: 2026-05-17
Status: Approved-in-principle; implementation plan to follow
Source: `START_HERE.md` (project root) + `src_data/base_prompt.txt`, `src_data/comunication.txt`

## 1. Goal

Replace the ad hoc ChatGPT workflow for daily reasoning practice with a small, local-first web app that:

- Generates exercises across three modes (memo extraction, technical incident response, LSAT-style logical reasoning).
- Lets the user answer in a timed editor.
- Scores the answer against a stable rubric using structured AI output.
- Stores every problem, attempt, evaluation, and model-call metadata in Postgres as the source of truth.
- Surfaces history so the system can adapt and avoid repeats.

Target loop time: 45 minutes Mon–Fri. The app's job is to remove friction from that loop, not to replace the user's thinking.

## 2. Scope (MVP, this design)

In scope — Phases 0 → 3 from `START_HERE.md`, plus a thin slice of Phase 4 (web search wiring) and Phase 5 (uniqueness hash):

- Project scaffold, lint/format, Docker Compose Postgres.
- Prisma schema (core tables, no `pgvector` yet).
- Seed: 1 user, 3 exercise types, 7 prompt versions.
- UI screens: Today, History (list + detail), minimal Admin/Prompts viewer.
- API routes: generate problem, get problem, submit attempt, evaluate attempt, list history.
- OpenAI Responses API integration with structured outputs and model-run logging.
- Per-mode generator + evaluator for all three exercise modes.
- Web search tool enabled for memo-extraction and incident-response generation.
- Uniqueness hash + recent-history avoidance hint sent into generator prompts.

Out of scope — deferred to later phases:

- pgvector / semantic memory (Phase 7).
- Weekly review screen + generator (Phase 6).
- Analytics screen (Phase 6).
- Auth, deployment hardening, backups, rate/cost limits (Phase 8).
- Multi-user, mobile, fine-tuning, gamification.

## 3. Stack & key decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | Single full-stack target; server actions + route handlers cover the small API surface. |
| DB | Postgres 16 in Docker Compose | Relational data, SQL analytics later, room for `pgvector`. |
| ORM | Prisma | User preference; mature migrations + Studio for local inspection. |
| UI | Tailwind + shadcn/ui | Owned-source primitives, fast to iterate, no runtime library lock-in. |
| AI | `openai` JS SDK, Responses API | Spec-mandated; structured outputs + hosted web search tool. |
| Default model | `gpt-5.5` (env-overridable) | Confirmed as OpenAI's current frontier model as of 2026-05-17. |
| Schema validation | Zod, mirroring OpenAI JSON schemas | Defense in depth: parse model output server-side even though the API enforces shape. |
| Tests | Vitest | Lightweight, plays well with Next.js + TS. |
| Auth | None; seeded single user | MVP is local. Hardcoded `USER_ID` in env. |

`.env.example` will carry: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.5`, `OPENAI_REASONING_EFFORT=medium`, `LOCAL_USER_ID`.

## 4. Architecture

```
brain-gym/
  app/
    layout.tsx
    page.tsx                       # redirects to /today
    today/page.tsx                 # exercise picker + active session
    history/page.tsx               # list
    history/[attemptId]/page.tsx   # detail (problem + answer + evaluation)
    admin/prompts/page.tsx         # view-only prompt registry
    api/
      problems/generate/route.ts
      problems/[id]/route.ts
      attempts/route.ts
      attempts/[id]/evaluate/route.ts
      history/route.ts
  components/
    ui/                            # shadcn primitives (button, card, tabs, ...)
    today/exercise-picker.tsx
    today/answer-editor.tsx
    today/feedback-panel.tsx
    today/timer.tsx
    history/history-list.tsx
  lib/
    db/client.ts                   # PrismaClient singleton
    openai/client.ts               # SDK init from env
    openai/run-model.ts            # wrapper: logs to model_runs, parses, validates
    exercises/
      types.ts                     # shared types
      registry.ts                  # exerciseType -> { generator, evaluator, schemas }
      memo-extraction/{generator.ts,evaluator.ts,schemas.ts}
      incident-response/{generator.ts,evaluator.ts,schemas.ts}
      lsat-logical-reasoning/{generator.ts,evaluator.ts,schemas.ts}
    prompts/registry.ts            # loads active prompt_versions from DB
    memory/uniqueness.ts           # hash + recent-history summarizer
    config.ts                      # env parsing (Zod)
  prisma/
    schema.prisma
    seed.ts
  prompts/                         # source of truth in git; seeded into DB
    base.md
    memo_extraction.generator.md
    memo_extraction.evaluator.md
    incident_response.generator.md
    incident_response.evaluator.md
    lsat_logical_reasoning.generator.md
    lsat_logical_reasoning.evaluator.md
  tests/
    unit/                          # schemas, hash, prompt loading
    integration/                   # db round-trip with a real test DB
  docker-compose.yml
  package.json
  tsconfig.json
  tailwind.config.ts
  .env.example
  .gitignore
  README.md
```

### Layering rules

- **Routes** are thin: parse input, call lib, return JSON. No business logic inline.
- **`lib/exercises/{mode}/`** owns everything mode-specific: schemas, prompt-composition, post-processing. Each mode exports `generate(input)` and `evaluate(input)` with identical signatures so the registry can dispatch by `exerciseType`.
- **`lib/openai/run-model.ts`** is the single chokepoint for OpenAI calls. Every call goes through it; every call writes a `model_runs` row (status `pending` → `completed`|`error`).
- **`lib/db/client.ts`** exports a process-singleton Prisma client (the standard Next.js pattern to avoid HMR connection leaks).

## 5. Data model

Follows the draft in `START_HERE.md` §"Data Model Draft" with these adjustments:

- Defer `memory_embeddings` (no `pgvector` extension this phase).
- Add `exercise_types.slug` to a TypeScript enum (`MEMO_EXTRACTION`, `INCIDENT_RESPONSE`, `LSAT_LOGICAL_REASONING`) so route handlers can switch type-safely.
- Add `attempts.status` enum (`SUBMITTED`, `EVALUATED`, `EVAL_FAILED`) so the UI can show "evaluation pending; retry" if the eval call fails — the attempt is never lost.
- Add a unique index on `(exercise_type_id, uniqueness_hash)` for problems, so duplicate detection is a DB-enforced constraint, not a guess.
- `model_runs.purpose` is an enum (`GENERATE_PROBLEM`, `EVALUATE_ATTEMPT`).

All `id` columns are `uuid` with DB-generated defaults. All `created_at` columns default to `now()`.

## 6. Core workflows

### 6.1 Generate problem

```
POST /api/problems/generate
body: { exerciseType, difficulty }

1. Load:
   - active base prompt + active generator prompt for {exerciseType}
   - last 20 problems of {exerciseType} (uniqueness_hash, tags, source URLs)
2. Compose Responses API call:
   - input: base prompt, generator prompt, "Generate a {difficulty} {type} problem.
     Avoid these recent items: <compact JSON of hashes/tags/urls>."
   - tools: [web_search] if exerciseType in {memo, incident}
   - response_format: json_schema(GeneratedProblem for {type})
   - reasoning.effort: from env
3. run-model.ts logs request → calls API → logs response, usage, status
4. Parse with Zod. Compute uniqueness_hash (sha256 over normalized
   {title + first 200 chars of prompt + sorted tags}).
5. If hash collides with any in the last-20 set, regenerate ONCE with explicit
   "do not produce X again" hint. Log second attempt as a separate model_runs row.
6. Insert problems row (transaction) + problem_sources rows for cited URLs.
7. Return user-visible payload (NEVER include hidden_answer_key).
```

### 6.2 Submit answer

```
POST /api/attempts
body: { problemId, responseText, timeSpentSeconds }

1. Insert attempts row immediately, status=SUBMITTED. Return attemptId.
   (Critical: durable before any further AI call.)
2. Client triggers evaluation.
```

### 6.3 Evaluate attempt

```
POST /api/attempts/:id/evaluate

1. Load problem + hidden answer key + rubric + active evaluator prompt for type.
2. Compose Responses API call:
   - input: base prompt, evaluator prompt, JSON of {problem, hiddenAnswerKey,
     rubric, userAnswer}
   - tools: none (no web search during evaluation)
   - response_format: json_schema(EvaluationResult)
3. run-model.ts logs the call.
4. On success: insert evaluations + evaluation_dimensions in one transaction;
   set attempts.status=EVALUATED; return result.
5. On failure: set attempts.status=EVAL_FAILED; surface a retry button.
   Attempt content is preserved either way.
```

### 6.4 History

```
GET /api/history?type=&from=&to=
-> list of attempts joined to problems with overall_score, evaluated_at.
   Paginated; default 30.

GET /api/history/:attemptId
-> full problem (user-visible payload only), attempt, evaluation,
   evaluation_dimensions.
```

## 7. Structured outputs

Mirrors `START_HERE.md` §"Structured Output Shapes" with type-specific refinements:

- `GeneratedProblem.hiddenAnswerKey` is `Record<string, unknown>` at the registry level but each mode's Zod schema in `lib/exercises/{mode}/schemas.ts` constrains it (e.g., for LSAT: `{ correctChoice: "A"|"B"|"C"|"D"|"E", explanation: string, distractorAnalyses: Record<choice, string> }`).
- Each mode exports two Zod schemas: `GeneratedProblemSchema` and `EvaluationResultSchema`. The JSON schemas passed to OpenAI are produced from those Zod schemas (single source of truth).

## 8. Prompt management

- Source-of-truth prompt content lives in `prompts/*.md` (git-versioned).
- `prisma/seed.ts` reads those files and upserts `prompt_versions` rows with `active=true` and `version=1`.
- `lib/prompts/registry.ts` loads the currently active prompt for `(exercise_type, role)` from the DB at call time, caching for the process lifetime. The DB row id is what gets stamped onto `problems.generation_prompt_version_id` and `evaluations.evaluator_prompt_version_id`, so future prompt edits don't retroactively rewrite history.
- Admin/Prompts page is read-only in the MVP (lists active versions + their content). Editing is deferred.

## 9. Error handling & data safety

- **Attempts persist before evaluation.** Even if the model call hangs, errors, or returns invalid JSON, the user's writing is in the DB.
- **Every model call is logged.** `model_runs` records request, response, usage, status, error. This is what makes calibration possible later.
- **Schema validation is two-layered.** OpenAI structured outputs enforce shape; Zod re-validates server-side. If Zod fails, mark the run as `error` with the validation message and return a 502 to the client.
- **Idempotency.** `/api/attempts/:id/evaluate` is safe to retry. If an `evaluations` row already exists for the attempt, return it instead of calling the model again.
- **Transactions.** Problem + sources insert as one transaction. Evaluation + dimensions insert as one transaction.
- **Secrets.** `OPENAI_API_KEY` only read server-side; never imported into a client component.

## 10. Testing strategy

Following `START_HERE.md` §"Testing Strategy":

- **Unit (Vitest):**
  - Each mode's `GeneratedProblemSchema` and `EvaluationResultSchema` round-trip a hand-written valid + invalid fixture.
  - `uniqueness.ts` hash is stable across runs and changes under meaningful diffs.
  - Prompt registry returns the active version and falls back when not found.
- **Integration (Vitest + test Postgres):**
  - Generate→persist a fake problem (the OpenAI client is faked at the `run-model.ts` seam, not deeper).
  - Submit attempt→persist; evaluate→persist; history query returns the full chain.
- **Manual calibration set (committed to repo, run by hand):**
  - 3 sample answers per exercise type — `bad`, `medium`, `strong`. Stored under `tests/calibration/`. After any prompt change, run them through the live evaluator and check score ordering is monotonic.

The OpenAI client is injected via a thin interface so integration tests don't hit the network.

## 11. UI sketch

- **Today (`/today`):**
  - Top: tabs for the 3 exercise types; difficulty radio (`easy` | `medium` | `hard`, default `medium`); "Generate" button.
  - Middle, after generate: problem panel (markdown rendering of `userVisiblePrompt`), timer, answer editor (textarea), Submit.
  - After submit: feedback panel (overall score, short diagnosis, dimension table, top fixes, next rep).
- **History (`/history`):**
  - Table: date, type, difficulty, title, score. Click → detail page.
  - Filters: type, difficulty, score range (later).
- **Admin/Prompts (`/admin/prompts`):**
  - Lists active prompt rows grouped by role; shows content in a read-only viewer.

Visual polish is intentionally minimal — utility, not delight.

## 12. Risks (from spec) and how this design addresses them

| Risk | Mitigation in this design |
|---|---|
| Context loss | All state in Postgres; recent history summarized into generation prompts. |
| Repetition | `uniqueness_hash` + unique index + recent-20 avoidance hint + one-shot regen. pgvector arrives in Phase 7. |
| Scoring drift | `prompt_versions` table + per-attempt prompt-version stamp + committed calibration set. |
| LSAT copyright | Generator prompt explicitly mandates original questions; provenance stored. |
| Cost/latency | `OPENAI_REASONING_EFFORT` env-tunable; web search disabled for evaluation; future cheap-model swap for summarization is a one-line change in `run-model.ts`. |

## 13. Acceptance criteria for this design's implementation

The MVP is "done" when, on a fresh clone:

1. `docker compose up -d` + `pnpm install` + `pnpm prisma migrate dev` + `pnpm prisma db seed` + `pnpm dev` produces a working app.
2. From `/today`, the user can pick each of the 3 exercise types, pick a difficulty, generate a problem, see it rendered, write an answer, submit, and see a structured evaluation.
3. Reloading `/history` shows the completed attempt with its score and links to a detail view that shows the full evaluation.
4. The `model_runs`, `problems`, `attempts`, `evaluations`, `evaluation_dimensions`, and `problem_sources` tables all contain rows after one full loop.
5. Killing the OpenAI call mid-evaluate (simulated 500) leaves the attempt durable and shows a retryable error in the UI.
6. `pnpm test` passes (unit + integration with a test DB).

## 14. Out of this design (revisit before building)

- Whether to use server actions vs. route handlers for the API surface — design assumes route handlers for explicitness; trivial to swap later.
- Whether the timer should be enforced (auto-submit) or advisory (just a display) — design assumes advisory for MVP.
- Pagination/infinite-scroll on history — design assumes simple offset/limit, 30 per page.

These are small enough that the implementation plan can make the call.
