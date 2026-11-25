import { randomUUID } from "node:crypto";
import {
  BackgroundJobKind,
  BackgroundJobStatus,
  type BackgroundJob,
  type Prisma
} from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  JobCapacityError,
  JobConflictError,
  LeaseLostError,
  type ClaimOptions,
  type EnqueueJobInput,
  type JobLease,
  type JobTransaction,
  type LeaseOptions
} from "./types";

export { JobCapacityError, JobConflictError, LeaseLostError } from "./types";
export const DEFAULT_LEASE_MS = 60_000;
export const MAX_JOB_ATTEMPTS = 5;
const MAX_UNFINISHED_PER_KIND = 2;
const ACTIVE_STATUSES = [BackgroundJobStatus.QUEUED, BackgroundJobStatus.RUNNING];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`);
  return value;
}

async function databaseNow(tx: JobTransaction): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return row.now;
}

async function updateEvaluationAttempt(
  tx: JobTransaction,
  job: Pick<BackgroundJob, "kind" | "payload" | "userId">,
  status: "SUBMITTED" | "EVAL_FAILED"
): Promise<void> {
  if (job.kind !== BackgroundJobKind.EVALUATION) return;
  const attemptId = (job.payload as { attemptId?: unknown } | null)?.attemptId;
  if (
    typeof attemptId !== "number" ||
    !Number.isSafeInteger(attemptId) ||
    attemptId <= 0 ||
    attemptId > 2_147_483_647
  )
    return;
  // Job status and the history-list projection change in the same transaction.
  // Never overwrite successfully persisted feedback, even after a stale failure.
  await tx.attempt.updateMany({
    where: { id: attemptId, userId: job.userId, evaluation: { is: null } },
    data: { status }
  });
}

async function expireExhaustedJobs(
  tx: JobTransaction,
  maxAttempts: number,
  now: Date
): Promise<void> {
  const where: Prisma.BackgroundJobWhereInput = {
    attempts: { gte: maxAttempts },
    OR: [
      { status: BackgroundJobStatus.QUEUED },
      {
        status: BackgroundJobStatus.RUNNING,
        OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }]
      }
    ]
  };
  const exhausted = await tx.backgroundJob.findMany({ where });
  for (const job of exhausted) {
    // Recheck the predicates while updating: a concurrent heartbeat may have
    // extended this lease after the initial read. Only actually failed jobs
    // may change their associated attempt status.
    const failed = await tx.backgroundJob.updateMany({
      where: { ...where, id: job.id },
      data: {
        status: BackgroundJobStatus.FAILED,
        error: "Background processing was interrupted repeatedly. Please retry.",
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: now
      }
    });
    if (failed.count) await updateEvaluationAttempt(tx, job, "EVAL_FAILED");
  }
}

/** Atomic, database-wide capacity check and idempotent enqueue/retry. */
export async function enqueueJob(input: EnqueueJobInput): Promise<BackgroundJob> {
  return prisma.$transaction(
    async (tx) => {
      // All server processes use this per-kind transaction lock. Capacity and
      // dedupe reads cannot race another enqueue, even for different users.
      const kindLock = input.kind === BackgroundJobKind.GENERATION ? 1 : 2;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1768446301, ${kindLock}::int)`;
      const now = await databaseNow(tx);
      await expireExhaustedJobs(tx, MAX_JOB_ATTEMPTS, now);
      const existing =
        input.dedupeKey === undefined
          ? null
          : await tx.backgroundJob.findUnique({
              where: {
                userId_kind_dedupeKey: {
                  userId: input.userId,
                  kind: input.kind,
                  dedupeKey: input.dedupeKey
                }
              }
            });
      if (existing) {
        // Compare only submitted primitive options. Worker-added prompt snapshots
        // and other internal metadata do not change the identity of a request.
        const requested = input.payload;
        if (requested && typeof requested === "object" && !Array.isArray(requested)) {
          const stored = existing.payload as Record<string, unknown>;
          for (const [key, value] of Object.entries(requested)) {
            if (
              (value === null || ["string", "number", "boolean"].includes(typeof value)) &&
              stored[key] !== value
            ) {
              throw new JobConflictError();
            }
          }
        }
        // A lost generation POST acknowledgement replays its settled failure as
        // well. Only an explicit new request key starts another paid generation.
        if (
          existing.status !== BackgroundJobStatus.FAILED ||
          input.kind === BackgroundJobKind.GENERATION
        )
          return existing;
      }
      const pending = await tx.backgroundJob.count({
        where: { kind: input.kind, status: { in: ACTIVE_STATUSES } }
      });
      if (pending >= MAX_UNFINISHED_PER_KIND) throw new JobCapacityError(input.kind);
      if (existing) {
        // A failed model call or expired worker may already have a valid paid
        // result checkpoint. Keep it so retry resumes persistence instead.
        const requeued = await tx.backgroundJob.update({
          where: { id: existing.id },
          data: {
            status: BackgroundJobStatus.QUEUED,
            error: null,
            completedAt: null,
            leaseToken: null,
            leaseExpiresAt: null,
            attempts: 0
          }
        });
        await updateEvaluationAttempt(tx, requeued, "SUBMITTED");
        return requeued;
      }
      return tx.backgroundJob.create({ data: input });
    },
    { maxWait: 10_000, timeout: 10_000 }
  );
}

/** Claim new work or recover an expired lease, exclusively across processes. */
export async function claimJob(options: ClaimOptions = {}): Promise<BackgroundJob | null> {
  const leaseMs = positiveInteger(options.leaseMs ?? DEFAULT_LEASE_MS, "leaseMs");
  const maxAttempts = positiveInteger(options.maxAttempts ?? MAX_JOB_ATTEMPTS, "maxAttempts");
  return prisma.$transaction(async (tx) => {
    const now = await databaseNow(tx);
    await expireExhaustedJobs(tx, maxAttempts, now);
    // SKIP LOCKED lets separate worker processes claim different jobs without
    // waiting for a worker currently committing a checkpoint/result.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "BackgroundJob"
      WHERE (status = 'QUEUED' OR (status = 'RUNNING' AND
        ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())))
        AND attempts < ${maxAttempts}
      ORDER BY "createdAt", id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `;
    if (!rows[0]) return null;
    const acquiredAt = await databaseNow(tx);
    return tx.backgroundJob.update({
      where: { id: rows[0].id },
      data: {
        status: BackgroundJobStatus.RUNNING,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(acquiredAt.getTime() + leaseMs),
        attempts: { increment: 1 },
        error: null,
        completedAt: null
      }
    });
  });
}

async function lockOwnedJob(tx: JobTransaction, job: JobLease): Promise<BackgroundJob> {
  if (!job.leaseToken) throw new LeaseLostError(job.id);
  const rows = await tx.$queryRaw<BackgroundJob[]>`
    SELECT * FROM "BackgroundJob" WHERE id = ${job.id}::uuid FOR UPDATE
  `;
  const row = rows[0];
  const now = await databaseNow(tx);
  if (
    !row ||
    row.status !== BackgroundJobStatus.RUNNING ||
    row.leaseToken !== job.leaseToken ||
    !row.leaseExpiresAt ||
    row.leaseExpiresAt.getTime() <= now.getTime()
  ) {
    throw new LeaseLostError(job.id);
  }
  return row;
}

/** Fence a short atomic result commit against expired/replaced workers. */
export async function withJobLease<T>(
  job: JobLease,
  commit: (tx: JobTransaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const owned = await lockOwnedJob(tx, job);
    const result = await commit(tx);
    // If work outlived its lease while holding the lock, roll back its writes.
    // The new owner can then resume the last committed checkpoint safely.
    const now = await databaseNow(tx);
    if (owned.leaseExpiresAt!.getTime() <= now.getTime()) throw new LeaseLostError(job.id);
    return result;
  });
}

export async function renewLease(
  jobId: string,
  token: string,
  options: LeaseOptions = {}
): Promise<boolean> {
  const leaseMs = positiveInteger(options.leaseMs ?? DEFAULT_LEASE_MS, "leaseMs");
  try {
    await prisma.$transaction(async (tx) => {
      await lockOwnedJob(tx, { id: jobId, leaseToken: token });
      const now = await databaseNow(tx);
      await tx.backgroundJob.update({
        where: { id: jobId },
        data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) }
      });
    });
    return true;
  } catch (error) {
    if (error instanceof LeaseLostError) return false;
    throw error;
  }
}

export async function getJob(jobId: string, userId: string): Promise<BackgroundJob | null> {
  if (!UUID.test(jobId)) return null;
  return prisma.backgroundJob.findUnique({ where: { id: jobId, userId } });
}

export async function getEvaluationJob(
  attemptId: number,
  userId: string
): Promise<BackgroundJob | null> {
  return prisma.backgroundJob.findUnique({
    where: {
      userId_kind_dedupeKey: {
        userId,
        kind: BackgroundJobKind.EVALUATION,
        dedupeKey: String(attemptId)
      }
    }
  });
}

export async function saveCheckpoint(
  jobId: string,
  token: string,
  checkpoint: Prisma.InputJsonValue
): Promise<void> {
  await withJobLease({ id: jobId, leaseToken: token }, async (tx) => {
    await tx.backgroundJob.update({ where: { id: jobId }, data: { checkpoint } });
  });
}

export async function finishJob(
  jobId: string,
  token: string,
  result: Prisma.InputJsonValue
): Promise<void> {
  await withJobLease({ id: jobId, leaseToken: token }, async (tx) => {
    await tx.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: BackgroundJobStatus.SUCCEEDED,
        result,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: await databaseNow(tx)
      }
    });
  });
}

export async function failJob(jobId: string, token: string, error: string): Promise<void> {
  await withJobLease({ id: jobId, leaseToken: token }, async (tx) => {
    const failed = await tx.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: BackgroundJobStatus.FAILED,
        error,
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: await databaseNow(tx)
      }
    });
    await updateEvaluationAttempt(tx, failed, "EVAL_FAILED");
  });
}
