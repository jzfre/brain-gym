# Semantic Duplicate Prevention (pgvector) — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorming complete, pending spec review)
**Scope:** Problems only. Implements the dedup half of START_HERE Phase 7 (Semantic Memory).

## Problem

Today's duplicate prevention is a single exact SHA-256 hash over the normalized
`{title, first 200 chars of prompt, sorted tags}` (`lib/memory/uniqueness.ts`),
stored on `Problem.uniquenessHash` with a unique constraint per exercise type
(`prisma/schema.prisma`). The generate flow does one retry on an exact hash
collision (`app/api/problems/generate/route.ts:38-52`).

This catches only byte-identical repeats. Rewording a single word changes the
hash entirely, so "same skill, different surface text" problems slip through.
For a deliberate-practice tool, undetected near-duplicates erode the training
value over time.

This project upgrades dedup from exact-match to **semantic** using embeddings +
pgvector, while keeping the exact-hash layer as a cheap fast path and DB
integrity net.

## Decisions (locked during brainstorming)

- **Storage/search:** pgvector inside the existing Postgres (not app-level
  cosine, not an external vector DB). Keeps one datastore, transactional with
  the problem insert, matches the spec.
- **Strategy:** both **reactive gate** (detect after generation) and
  **proactive steering** (feed semantic neighbors into the avoidance hint on
  retry). They form a feedback loop, not two parallel systems.
- **Retry-exhaustion fallback:** retry up to `DEDUP_MAX_RETRIES`, then save the
  **least-similar** candidate seen and flag it `isNearDuplicate=true`. Never
  blocks the user's daily rep; the flag surfaces when the topic pool is thinning.
- **Scope:** embed **problems only**. Attempt/evaluation embeddings are deferred
  to the next "close the loop" project; the pgvector setup here makes adding
  them a small change.
- **Data preservation:** none required. The pgvector image swap is done on a
  fresh volume (`docker compose down -v`), so there is **no backfill script** and
  no in-place data migration.
- **Embedding model:** `text-embedding-3-small` (1536 dims), injectable for tests.

## Architecture

### Data model (`prisma/schema.prisma`)

New `Problem` fields:

| Field | Type | Purpose |
|---|---|---|
| `embedding` | `Unsupported("vector(1536)")?` | Problem embedding. Nullable so a failed embedding never blocks the save. |
| `isNearDuplicate` | `Boolean @default(false)` | Set when a problem was saved despite exceeding the similarity threshold (fallback path). |
| `nearestSimilarity` | `Float?` | Cosine similarity to the closest prior problem at insert time. Drives Admin visibility and future saturation analytics. |

Migration steps:
1. `CREATE EXTENSION IF NOT EXISTS vector;`
2. Add the three columns.
3. `CREATE INDEX problem_embedding_hnsw ON "Problem" USING hnsw (embedding vector_cosine_ops);`
   (HNSW needs no training step and suits this scale. NULL embeddings are simply
   excluded from the index and from search results.)

The existing `uniquenessHash` column and `@@unique([exerciseTypeId, uniquenessHash])`
constraint stay. An exact hash collision is treated as similarity = 1.0 inside the
loop, so the semantic loop subsumes the old single-retry behavior — no separate
code path.

### Infrastructure (`docker-compose.yml`)

- `db.image`: `postgres:16-alpine` → `pgvector/pgvector:pg16` (drop-in, same
  Postgres 16, adds the extension).
- Upgrade path for an existing dev volume: `docker compose down -v` then
  `docker compose up -d db` then `pnpm db:migrate`. No data preserved by design.

### Config (`lib/config.ts` + `.env.example`)

All zod-validated, with defaults:

| Var | Default | Meaning |
|---|---|---|
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model (1536 dims). |
| `DEDUP_SIMILARITY_THRESHOLD` | `0.85` | Cosine ≥ this = "too similar". |
| `DEDUP_MAX_RETRIES` | `3` | Total generation attempts before fallback. |
| `DEDUP_NEIGHBOR_K` | `5` | Nearest prior problems retrieved for the gate + steering hint. |

### Modules

**`lib/memory/embedding.ts`**
- `problemEmbeddingText(problem)` — the single canonical definition of what we
  embed: `title` + `userVisiblePrompt` + sorted `tags` (+ LSAT `questions`
  stimuli when present), normalized into one string. Both the gate and any
  future embedder reuse this so they never drift.
- `embedText(text, deps?)` — wraps OpenAI embeddings via the existing client.
  The embedder is **injectable** via `deps` so tests pass deterministic vectors.
  Returns `number[]`, or `null` on failure (non-fatal).

**`lib/memory/similarity.ts`**
- `findSimilarProblems({ exerciseTypeId, embedding, k })` — the **only** place
  raw SQL lives. `prisma.$queryRaw` with pgvector's `<=>` cosine operator;
  returns the `k` nearest prior problems of that exercise type with
  `similarity = 1 - (embedding <=> $query)`, closest first. On query failure it
  is caught and the request degrades to hash-only.

### Generate flow (`app/api/problems/generate/route.ts`)

Replaces the current single hash-retry block with a two-pass loop:

```
attempt 1: mode.generate(recency avoidance hint)   // unchanged first pass
  → embedText(problemEmbeddingText(problem))
  → findSimilarProblems(k) → maxSim = similarity to nearest prior
  → maxSim < threshold? ACCEPT (isNearDuplicate=false, nearestSimilarity=maxSim)
  → else: record candidate + maxSim, continue

attempts 2..DEDUP_MAX_RETRIES: mode.generate(avoidance hint AUGMENTED with the
  titles + tags of the specific nearest neighbors it collided with)  // steering
  → same embed + check

budget exhausted: save the BEST candidate (lowest maxSim) with
  isNearDuplicate = (bestMaxSim >= threshold), nearestSimilarity = bestMaxSim
```

The reactive gate produces the query vector and the specific neighbors that the
proactive steering uses on retry — that is why "both" is one loop, not two
systems. Steering does not run on the first pass because there is no seed vector
to query by until the model has produced a candidate.

The embedding is written in the **same transaction** as the problem insert, so a
problem and its embedding are always consistent.

### Error handling / resilience

- **Embedding API failure** → `embedText` returns `null` → skip the semantic gate
  for that problem, fall back to exact-hash behavior, and **save the problem
  anyway** with `embedding = null`, `nearestSimilarity = null`. Generation never
  502s over an embedding hiccup. (No backfill exists, so such a problem simply
  participates in dedup as a non-embedded row until naturally superseded; this is
  an accepted rare edge given embeddings are cheap and reliable.)
- **pgvector query failure** → caught in `findSimilarProblems`, degrade to
  hash-only for that request.

### Visibility

- **Admin** (`app/admin`): problems view shows a `near-dup` badge and the
  `nearestSimilarity` value — the natural home for "is dedup struggling?".
- **History**: a subtle badge on a problem saved as a near-duplicate, for honesty
  in context. No loud UI.

## Testing

- **Unit (no OpenAI, no DB):**
  - `problemEmbeddingText` produces a stable canonical string, including the
    LSAT-`questions` case.
  - Config parsing accepts valid and rejects invalid new env vars.
  - Accept/retry/flag decision logic with a **stubbed embedder** returning
    controlled vectors: under-threshold accepts on attempt 1; over-threshold
    retries; budget-exhausted saves the lowest-similarity candidate with
    `isNearDuplicate=true`.
- **Integration (DB + pgvector, mocked embedder):**
  - `findSimilarProblems` returns inserted problems ordered by similarity and
    respects `exerciseTypeId` scoping.
  - The embedding-failure (`null`) path still saves the problem.
- Embeddings are **always mocked** in tests (injected deterministic vectors): no
  network, fast, deterministic.

## Documentation (README — final step, reflecting shipped state)

- `Run locally` + `Deploy with Docker`: note `pgvector/pgvector:pg16` and the
  one-time `down -v` when upgrading an old volume.
- `Env` table: the four new `EMBEDDING_*` / `DEDUP_*` vars.
- New **"Duplicate prevention"** subsection: layered exact-hash + semantic-gate
  design and the near-duplicate flag.
- `Troubleshooting`: "pgvector extension missing" → ensure the image is
  `pgvector/pgvector`, re-run migrate.

## Out of scope

- Attempt and evaluation embeddings (next project: close the loop).
- Calibration set, analytics/weekly review, UX polish.
- Any backfill of pre-existing problems (data is wiped).

## Acceptance criteria

- A reworded near-duplicate that the exact hash misses is detected and triggers a
  steered regeneration.
- A generation never fails or blocks because of an embedding/pgvector error.
- When retries are exhausted, the least-similar candidate is saved and flagged
  `isNearDuplicate`, visible in Admin and History.
- `findSimilarProblems` is the only place raw vector SQL lives.
- `pnpm test` passes with embeddings fully mocked.
- README reflects the shipped pgvector setup, env vars, and dedup behavior.
