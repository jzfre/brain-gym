# Testing and grading evaluations

## Fast checks

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm eval
pnpm build
```

Installation generates the Prisma client. `pnpm test` includes unit tests and
`tests/evals/`; `pnpm eval` selects only the grading scenarios. Neither loads
`.env`, uses a real API key, nor connects to the application database. The old
arithmetic smoke test was replaced with behavior checks.

Coverage includes authentication, API validation and user scoping, async job
retention/concurrency, failed evaluation recovery, client request cancellation,
semantic-dedup failure handling, and grader output validation. UI request tests
exercise the extracted request logic, not rendered browser interactions.

## Real PostgreSQL integration tests

Use a disposable database whose name ends in `_test`. Do not point tests at the
host application's database. The runner requires `TEST_DATABASE_URL` explicitly;
it refuses to infer it from `DATABASE_URL` or `.env`.

One isolated setup (requires Docker):

```bash
docker run -d --name brain-gym-test-db \
  -e POSTGRES_USER=brain -e POSTGRES_PASSWORD=brain \
  -e POSTGRES_DB=brain_gym_test \
  -p 127.0.0.1:55438:5432 pgvector/pgvector:pg16
# Wait until this succeeds:
docker exec brain-gym-test-db pg_isready -U brain -d brain_gym_test
export TEST_DATABASE_URL='postgresql://brain:brain@127.0.0.1:55438/brain_gym_test?schema=public'
DATABASE_URL="$TEST_DATABASE_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
pnpm test:integration
# Remove only this disposable container when done:
docker rm -f brain-gym-test-db
```

The database role must be able to install `vector`, or an administrator must
install the extension before migration. Tests create and remove fixture problems;
run one suite at a time against a fresh seeded database. CI provisions its own
PostgreSQL 16 + pgvector service, applies all migrations, seeds, runs both suites,
and builds the application.

## Grading eval scope

The deterministic evals exercise actual evaluator functions with controlled model
responses. Scenarios check LSAT objective scoring regardless of model claims,
question alignment, invalid/duplicate answers, malformed feedback, and memo /
incident rubric scores, dimensions, and completeness. These guard scoring and
validation logic without spending API credits.

They do **not** measure the live model's reasoning quality, calibration, source
accuracy, or robustness to prompt injection. Before changing a prompt or model,
review generated exercises in all three modes and grade a small saved set of
strong, weak, incomplete, and adversarial answers. Compare objective LSAT scores,
rubric feedback, citations, latency, and cost with the previous configuration.
Record the model, reasoning effort, prompt version, and reviewer decisions; do
not treat a passing mocked eval as evidence of live model quality.

## Opt-in live model checks

See [model quality](model-quality.md). `pnpm eval:live --dry-run` writes a planned
report without provider calls. Live runs require configured credentials and retain
inputs, prompts, schemas, outputs, usage, timings, and pass/fail evidence. Optional
repeats and blind generated-LSAT review are available. No live run has been
completed in this environment; dry runs do not count as quality validation.

## Production HTTP smoke

After building, run `pnpm test:smoke` with the same `TEST_DATABASE_URL` used for
integration tests. It starts the built server on a temporary loopback port,
creates isolated fixtures, checks login/cookie flags, protected routes, saved
problem reopening, submission/history, answer-key privacy, and user isolation,
then removes its fixtures and stops the server. It uses fake model credentials and a local Responses/embeddings protocol server.
All three modes execute generation, submission, evaluation, and database
persistence through the real SDK; the model content is a deterministic fixture.
It also checks recovery after incomplete provider responses and rubric-invalid
feedback without endlessly replaying rejected cached output. CI runs it after build.
This checks real server behavior. The separate Chromium suite below exercises browser interactions.

During live review, check LSAT explanation text against the displayed shuffled
choices. Structured answer keys are remapped and correctness is deterministic,
but generated free-text explanations can still refer to an original option
letter. Automated schema/scoring checks cannot establish semantic correctness.

## Real browser regressions

```bash
pnpm exec playwright install --with-deps chromium
pnpm build
# Explicit TEST_DATABASE_URL must name a migrated disposable _test database.
pnpm test:browser
```

The Chromium suite uses isolated fixtures and fake API credentials. It verifies
readiness/focus, timer continuity, memo/incident/LSAT drafts across reloads and
navigation, expired-session sign-in recovery, corrupt/blocked storage, and
submission recovery after dropping a response **after the server committed it**.
The retry must produce exactly one persisted attempt. Screenshot/results paths
are printed on completion. CI installs Chromium and runs this after HTTP smoke.
It does not call a live model; model quality remains a separate opt-in eval.

## Validation scope

The [reliability review](reliability-review.md) records the deeper reproduced
failures and checks. Browser tests, full server workflows with a local provider,
real PostgreSQL concurrency/disconnect tests, offline grading invariants, lint,
TypeScript, production build, and dependency audits are separate checks: none
alone establishes end-to-end live model quality.

## Durable worker and restart checks

`pnpm test:restart` uses the same migrated disposable `TEST_DATABASE_URL`. It
kills and restarts the built server during real queued work, using a local
Responses/embeddings fixture. It checks accepted-job recovery, replay of completed
model responses, evaluation checkpoint recovery, and retry after a proxy drops
an enqueue response. No paid calls are made.

Database integration tests additionally use independent Node processes to race
queue enqueue/claims, replace expired leases, reject late worker writes, and
replay persisted model responses. Integration files run serially because the
queue capacity is deliberately shared across all users in one database.
