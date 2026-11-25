# Reliability review — 2026-11-17

## Reproduced failures and changes

| Failure | Evidence | Change |
|---|---|---|
| Overall grade contradicted every dimension | Actual schema/validator accepted overall 10/10 with six zero-scored dimensions | Calculate total from saved rubric points; preserve historical evaluations |
| LSAT shuffling corrupted questions or explanations | Correct option moved A→E while prose still said A; cross-option references changed meaning | Preserve order for label/position-dependent prose; shuffle only conservatively |
| Generated content passed JSON validation but was unusable | Blank choices/keys, repeated headings/rubrics, and overflowing timers accepted | Validate usable content and bounds; fix generated rubric scales/names |
| Distinct LSAT sets collided and duplicates exhausted paid work | Hash ignored actual questions; exact collision checked only at final insert | Include normalized question content; retry exact duplicates within one bounded generation budget; account for legacy hashes |
| First-ever problem marked a near-duplicate | Threshold 0 with zero neighbors caused repeated generation | Empty neighbor set accepts the first candidate |
| Drafts vanished during normal use | Chromium reproduced memo/LSAT loss after reload, navigation, and sign-in | Per-problem browser drafts, resumable URLs, retained position/start time, storage failure handling |
| Retrying a committed submission duplicated history | Drop server response after commit; retry created two rows | Stable browser submission UUID plus database uniqueness; conflicting content returns 409 |
| Evaluation requests caused unbounded model work | Twelve distinct requests launched twelve concurrent calls | Two accepted, ten receive retryable 429; slots release on completion |
| Transient persistence failure repeated paid evaluation | Model returned successfully, first database transaction failed, user retry called model again | Retry only transient atomic DB operations while retaining the result; one evaluator invocation |
| Partial startup never repaired itself | Exercise rows existed but base prompt was missing; old startup skipped seed | Transactional initialization on every start, inserting missing defaults only |
| Reseeding altered historical prompt provenance | Existing v1 content was overwritten in place | Preserve all existing prompt versions and metadata; publish changes as new versions |

## Evidence layers

- **Real Chromium, production build:** readiness/focus, elapsed clock, all three
  editors, reload/navigation/session-expiry recovery, dropped-response retries,
  stored LSAT answers, malformed/unavailable storage, resumable generated URLs.
  No browser JavaScript errors in the passing run.
- **Actual PostgreSQL:** twelve concurrent same-key submissions persist one row;
  differing answers sharing a key conflict; keys are scoped by user. Terminating
  the active test transaction's own PostgreSQL backend recovers on the next
  persistence attempt, without restarting or affecting other sessions.
- **Complete server workflows:** local Responses/embeddings HTTP fixtures drive
  the actual OpenAI SDK, structured validators, async routes, and database for
  memo, incident, and LSAT. Tests include incomplete response → failed attempt →
  successful retry, and repeated evaluation requests returning the existing result.
- **Pure/schema and unit checks:** adversarial generated structures, deterministic
  score arithmetic, safe shuffling, exact/semantic dedup, job retention, API
  validation, authentication, and real SDK JSON-schema conversion.
- **Operational checks:** migrations on the disposable DB, transactional seed
  repair/preservation/rollback, frozen install, lint, typecheck, production build,
  full dependency audit, and the live-eval dry-run manifest.

All automated database checks require an explicit disposable `_test` database.
No live user database or paid model endpoint was used.

## Final verification

The final durable-worker run passed 327 offline tests, 29 PostgreSQL integration
tests, all three full server workflows (71 HTTP checks in that run), four real
TCP-drop/process-kill recovery cases, and nine Chromium interaction/recovery
flow groups. Lint, TypeScript, production build, and the dependency audit passed.
The browser reported no JavaScript errors. Current browser artifacts are at
`/tmp/brain-gym-browser-dc90a2fd-062b-4d9d-8cc0-c33020559439`; rerunning
`pnpm test:browser` produces a new evidence directory.

The restart suite proves acceptance replay after a dropped TCP response,
recovery of accepted work after SIGKILL, and reuse of completed generation and
evaluation responses without another provider call. Pipeline checks also prove
that structurally valid but rubric-invalid feedback is not replayed forever:
manual retry obtains fresh output, while valid persistence checkpoints are retained.
Live provider quality remains unverified: the actual CLI dry-run saved only a
planned report, and no API credentials/model are configured here.

## Limits and unresolved production questions

- The earlier process-local limitation has now been replaced by the
  [durable worker](durable-jobs.md), with database leases, prompt/model checkpoints,
  fenced commits, and real process-kill recovery tests. A response received from
  the provider but not yet durably saved can still be billed again after recovery;
  exactly-once remote execution is not claimed.
- Local protocol fixtures establish application behavior, not live model
  correctness, factual grounding, citation quality, or resistance to every prompt
  injection. The [live quality harness](model-quality.md) supports repeated cases and blind
  review of generated keys, but live runs were not executed here because
  credentials are unavailable. Their thresholds need human calibration.
- Previously generated LSAT problems whose option text was already shuffled
  incorrectly cannot be repaired reliably without original model output. New
  generation conservatively preserves potentially label-dependent ordering. The
  reference scanner recognizes letters and common positional wording; it is a
  heuristic and cannot prove arbitrary natural-language independence.
- Drafts are browser-local; clearing storage or moving devices does not recover
  them. Elapsed time includes time away. Older API clients without submission IDs
  can still create duplicates.
- Docker image execution and Rocinante deployment remain unverified from this
  environment; Docker is unavailable and Rocinante's hostname does not resolve.
  The additive database migration is required before running the new app.
