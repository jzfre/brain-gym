# Durable generation and evaluation

## Runtime

The Node server starts a background worker through Next.js instrumentation. No
separate daemon or new container is required. POST routes commit a PostgreSQL
`BackgroundJob` before returning 202. Polling reads that database record, so a
restart cannot erase an accepted job ID. The browser stores generation request
IDs before POST and accepted job IDs afterward; reload/sign-in resumes the same
request or job. A different generation payload cannot reuse the same request ID.

Both generation and evaluation allow at most two unfinished jobs globally per
kind. Transaction locks arbitrate enqueue capacity and request-key uniqueness.
Workers claim with `FOR UPDATE SKIP LOCKED`; claims increment the attempt counter
and carry a new random token plus an expiry timestamp from the database clock.

Defaults:

- `JOB_POLL_MS=1000`: work discovery interval (100–300000 ms).
- `JOB_LEASE_MS=60000`: ownership duration (1000–300000 ms), renewed every third
  of the lease. Use the default in production; short test leases are sensitive to
  database latency.
- Five claims maximum before repeatedly interrupted work is marked failed.
  Evaluation can then be explicitly retried; a failed generation can be replaced
  by a new request. Failed generation request-ID replays return the original
  failure, rather than silently spending more tokens.

After a crash, a replacement worker waits for the prior lease to expire and then
continues automatically. A running browser shows pending work during recovery.
Database outages cause polling to retry; no accepted job exists only in memory.
Queued work requires a running server/worker, so this is not a serverless setup.

## Checkpoints and commit safety

1. Prompt versions/content are pinned in the job on first use.
2. Each model step gets a durable ModelRun record before the provider call, with
   its original request. Completed parsed responses are persisted and replayed
   by step number after a restart; a failed step retains its audit row when retried.
3. The selected generation candidate (including stable problem ID) or evaluated
   feedback is checkpointed before writing application rows.
4. Problem/evaluation rows and job success commit in one fenced transaction.
   Ownership is checked while the job row is locked and again against lease
   expiry before committing. An expired/replaced worker cannot write a result.

Completed checkpoints avoid repeating paid model work during recovery. This is
**not exactly-once provider execution**: if the process or database fails after
the provider finishes but before its response is durably recorded, the step may
be sent again. Provider billing in that ambiguous window cannot be prevented by
a local database lease. A new schema/code version must remain compatible with
queued payloads and checkpoints; drain work before incompatible upgrades.

Application persistence is idempotent: generation retains a candidate UUID;
evaluation is unique per attempt. Attempt submissions separately retain their
user-scoped submission UUID. Generation request UUIDs are also scoped by user.
Changing settings under a reused UUID returns 409.

## Deployment and operations

Apply `20261118000000_durable_background_jobs` after the submission-idempotency
migration. It adds jobs and optional ModelRun job/step references; existing
attempts, problems and evaluations remain unchanged. Docker entrypoint migration
runs before startup. Old in-memory jobs cannot be imported: drain the old server
before the first upgrade. Existing interrupted attempts can be retried in History
to enter the durable queue.

Inspect work from the canonical service directory:

```bash
docker compose exec -T db psql -U brain -d brain_gym -c \
  'SELECT id, kind, status, attempts, "leaseExpiresAt", "createdAt", error FROM "BackgroundJob" ORDER BY "createdAt" DESC LIMIT 30;'
```

Queued/running rows and ModelRun records must not be removed during processing.
Job status/result records currently have no automatic expiry, allowing old browser
requests to recover. Checkpoints and prompt snapshots occupy database space and
may contain answers; include them in backups and access controls. Retention/pruning
is an explicit future operational policy, not a background deletion task.

Roll back to a pre-queue application only after draining jobs: older code does not
run this worker and will not process persisted queued requests. Do not drop the
new tables/columns or remove the data volume as part of rollback.

## Verification

`pnpm test:integration` exercises concurrent independent processes, cross-user
scoping, exclusive claims, lease expiry, stale commits, retries and completed
model replay against PostgreSQL. `pnpm test:restart` kills a real built Next.js
server in controlled generation/evaluation windows and restarts it on the same
database. A local provider fixture supplies content; no paid model call or live
model-quality claim is involved. `pnpm test:browser` checks browser recovery and
request-ID behavior across reload and authentication.
