# Async problem generation with HTTP polling

**Date:** 2026-06-05
**Status:** Approved (user: "do it so it works")

## Problem

`POST /api/problems/generate` ran the whole pipeline — model generation (gpt-5.5,
high reasoning effort), embedding, up to 3 dedup retries, DB write — inside one
HTTP request. Behind the Cloudflare tunnel this hits Cloudflare's hard 100-second
proxy ceiling: the browser gets a 524 while the server finishes generating into a
response nobody receives. The app must be usable from any device through
`braingym.aqui.technology`, so "bypass the proxy" is not an option.

## Decision

Mirror the existing evaluate flow (202 + background promise + client polling),
which already solves this exact problem for evaluations.

Job state lives **in process memory** (user's explicit choice over a DB table):
single-user app, single long-lived Node process in the production container. A
container restart loses the map, but it equally kills the in-flight generation,
so an unknown job id always means "retry".

## Design

- `lib/generation/jobs.ts` — module-level `Map<string, GenerationJob>`;
  `GenerationJob = { status: pending|succeeded|failed, problemId?, error?, createdAt }`.
  Entries older than 30 min are pruned on insert.
- `POST /api/problems/generate` — validate (400 as before), `createJob()`,
  `void runGeneration(...)` (the previously-inline pipeline, unchanged), return
  **202 `{ jobId }`**. Failures `console.error` (they were previously silent) and
  `failJob(jobId, message)`. The old 502-with-message response is gone.
- `GET /api/problems/generate/[jobId]` — `{ status, problemId, error }`; 404 for
  unknown ids.
- `exercise-picker.tsx` — POST → poll every 3s (same cadence as feedback-panel)
  until `succeeded` (fetch the problem as before), `failed` (show the real error
  message), 404 (retry message), or a 15-min client deadline.

## Testing

Unit tests for the job store lifecycle and pruning (`tests/unit/generation-jobs.test.ts`).
The pipeline itself is unchanged and stays covered by the existing dedup tests.
