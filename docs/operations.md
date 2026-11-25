# Operations

## Deployment scope

Run a long-lived Node server with PostgreSQL 16 + pgvector. Generation and
evaluation jobs are durable, claimed by the server's startup worker using database
leases. Each kind is limited to two queued/running jobs database-wide. Restarted
workers resume expired leases and saved responses/checkpoints. The login failure
budget remains process-local. HTTPS is required for production cookies; keep
app/database ports on loopback behind the proxy. See [durable jobs](durable-jobs.md).

`GET /api/health` is public and uncached: 200 means the app can query PostgreSQL;
503 means the database check failed. It returns no connection details. This is a
connectivity check, not proof that prompts are seeded or OpenAI is available.
The portable Compose file checks it every 30 seconds; Docker's health status
alone does not automatically restart an unhealthy container.

## Rocinante

Existing host notes identify source at `/home/jzfre/Code/personal/brain-gym` and
canonical Compose/config at `/home/jzfre/services/brain-gym`. Read that service's
README before deployment. Its private Compose and `.env` are not in this checkout;
keep those authoritative and preserve the existing `brain-gym_pgdata` volume.

1. Transfer/review the updated source using the host's normal Git workflow.
2. Run `pnpm install --frozen-lockfile && pnpm check && pnpm build` in the source
   checkout. Never run integration tests against the live database.
3. Finish active exercises and stop starting new work. From the service directory,
   inspect pending work:

   ```bash
   docker compose exec -T db psql -U brain -d brain_gym -c \
     'SELECT status, count(*) FROM "ModelRun" GROUP BY status; SELECT status, count(*) FROM "Attempt" GROUP BY status;'
   ```

   Drain the old in-memory implementation before the first queue upgrade; existing
   jobs cannot be migrated out of a running process. After upgrading, inspect
   `BackgroundJob` for active work; ordinary restarts resume it after lease expiry.
4. Back up the database and record the current application image:

   ```bash
   umask 077
   docker inspect brain_gym_app --format '{{.Image}}'
   docker compose exec -T db pg_dump -U brain -d brain_gym -Fc > "brain-gym-$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```

   Verify the dump is nonempty and retain a copy away from the host. Test restoration
   into a separate database periodically. Dumps contain private answers and model
   payloads.
5. In `/home/jzfre/services/brain-gym`, rebuild only the application:

   ```bash
   docker compose up -d --build --no-deps app
   docker compose logs --tail=100 app
   curl --fail http://127.0.0.1:3111/api/health
   ```

   The entrypoint applies migrations and transactionally repairs missing seed data. Existing prompt versions, user metadata, and exercise settings are preserved.
   Confirm login over HTTPS, History, and all three exercise pickers. The public
   URL in the host notes is `https://braingym.aqui.technology`.

Apply both `20261117000000_attempt_idempotency` and
`20261118000000_durable_background_jobs` before starting the new code. Docker
startup does this automatically. These add submission IDs, durable jobs, and
optional ModelRun checkpoint references without changing existing saved answers.
To roll back to older code, drain the durable queue first: old application images
do not process it. Restore the previous source/image without dropping tables or
the database volume. Preserve the backup and recorded image for rollback.
The portable Compose healthcheck is not automatically copied into the private
host Compose file; add it there if absent.

## Recovery

- **Interrupted generation:** the same job resumes after its lease expires
  (normally within about a minute). The browser resumes its stored request/job
  after reload or sign-in. A completed result remains queryable.
- **Interrupted evaluation:** the same saved attempt resumes automatically.
  After five interrupted claims the job fails visibly and can be explicitly
  retried from History. Older pre-queue interrupted attempts need a manual retry.
- **Embedding failures:** generation continues without semantic deduplication;
  exact uniqueness remains enforced. Check server logs for provider failures.
- **Bad model output:** grading fails instead of saving inconsistent dimensions
  or scores. Check server logs / ModelRun data and retry the saved attempt.
- **Login 429:** wait for `Retry-After` (at most 60 seconds). The shared-password
  app permits ten failed logins per minute per process; public deployments should
  also use proxy-level throttling to reduce deliberate lockout abuse.
- **Prompt changes:** prompt versions are cached in process. Restart when changing
  active prompts directly in the database. Rerunning `db:seed` now fills missing defaults only. To publish changed prompt files, create a new prompt version, deactivate the previous version for that role/exercise, and restart; preserve old version contents so historical references remain accurate.
- **Missing vector extension:** use the pgvector-enabled PostgreSQL 16 image and
  enable `vector` with an administrator. Never run `docker compose down -v` as an
  upgrade or repair step on a populated installation.

Rotate `SESSION_SECRET` to invalidate all login sessions. Rotate `APP_PASSWORD`
separately; changing only the password does not invalidate existing cookies.

## Submission and database recovery

New browser drafts send `clientSubmissionId`; the unique database constraint
makes concurrent/lost-response retries return one attempt. The original answer
and elapsed time remain immutable. A different answer using the same ID returns
409 and asks the user to review History. Older API clients that omit the key are
accepted for compatibility and do not receive idempotency guarantees.

Short transient Prisma connection/transaction failures retry only the database
operation, with delays of 250 ms, 1 s, and 3 s. Completed model responses and
selected results are persisted in the queue workflow and reused after restart.
A provider response received but not yet durably saved remains an ambiguous
boundary: recovery can call the provider again. See [durable jobs](durable-jobs.md)
for lease settings, inspection commands, retention, and ownership guarantees.

Startup seeding now runs on every start in one transaction and serializes with
other seed invocations. It repairs partial installations without editing existing
prompt versions or reactivating deliberately inactive rows. Existing historical
prompt content already modified before this change cannot be reconstructed by
seeding.
