import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  claimJob,
  enqueueJob,
  failJob,
  finishJob,
  getEvaluationJob,
  getJob,
  JobCapacityError,
  JobConflictError,
  LeaseLostError,
  renewLease,
  saveCheckpoint,
  withJobLease
} from "@/lib/jobs/store";

const userId = randomUUID();
const otherUserId = randomUUID();
let problemId: string;
let evaluatorPromptId: string;
const attemptFixture = () =>
  prisma.attempt.create({
    data: {
      userId,
      problemId,
      responseText: "Queue status fixture",
      timeSpentSeconds: 10
    }
  });
const generation = () =>
  enqueueJob({ userId, kind: "GENERATION", payload: { exerciseSlug: "MEMO_EXTRACTION" } });
const evaluation = (dedupeKey = "42") =>
  enqueueJob({ userId, kind: "EVALUATION", payload: { attemptId: Number(dedupeKey) }, dedupeKey });

// Independent Node processes each load their own Prisma client and queue module.
// This catches process-local locks/maps that same-process Promise.all cannot.
async function childEnqueue(
  kind: "GENERATION" | "EVALUATION",
  dedupeKey?: string
): Promise<{ id?: string; error?: string }> {
  const storeUrl = pathToFileURL(resolve("lib/jobs/store.ts")).href;
  const dbUrl = pathToFileURL(resolve("lib/db/client.ts")).href;
  const script = `
    const { enqueueJob } = await import(${JSON.stringify(storeUrl)});
    const { prisma } = await import(${JSON.stringify(dbUrl)});
    try {
      const job = await enqueueJob(${JSON.stringify({ userId, kind, payload: { source: "child" }, dedupeKey })});
      console.log(JSON.stringify({ id: job.id }));
    } catch (error) { console.log(JSON.stringify({ error: error.name })); }
    finally { await prisma.$disconnect(); }
  `;
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let out = "",
      err = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Queue child exited ${code}: ${err}`));
      else {
        try {
          resolveResult(JSON.parse(out.trim().split("\n").at(-1)!));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

beforeAll(async () => {
  const exercise = await prisma.exerciseType.findUniqueOrThrow({
    where: { slug: "MEMO_EXTRACTION" }
  });
  const generator = await prisma.promptVersion.findFirstOrThrow({
    where: { exerciseTypeId: exercise.id, role: "GENERATOR" }
  });
  const evaluator = await prisma.promptVersion.findFirstOrThrow({
    where: { exerciseTypeId: exercise.id, role: "EVALUATOR" }
  });
  evaluatorPromptId = evaluator.id;
  const problem = await prisma.problem.create({
    data: {
      exerciseTypeId: exercise.id,
      title: "Durable queue status fixture",
      promptText: "Question",
      userVisiblePayload: {},
      hiddenAnswerKey: {},
      rubric: {},
      timeboxMinutes: 5,
      suggestedPacing: [],
      requiredAnswerSections: [],
      difficulty: "EASY",
      uniquenessHash: randomUUID(),
      generatedByModel: "fixture",
      generationPromptVersionId: generator.id
    }
  });
  problemId = problem.id;
  await prisma.user.createMany({
    data: [userId, otherUserId].map((id) => ({
      id,
      email: `durable-jobs-${id}@example.invalid`,
      displayName: "Queue fixture"
    }))
  });
});
afterEach(async () => {
  await prisma.modelRun.deleteMany({
    where: { backgroundJob: { userId: { in: [userId, otherUserId] } } }
  });
  await prisma.backgroundJob.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.attempt.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
});
afterAll(async () => {
  if (problemId) await prisma.problem.delete({ where: { id: problemId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.$disconnect();
});

describe("durable PostgreSQL job store", () => {
  it("enforces the two-job capacity atomically across independent processes", async () => {
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => childEnqueue("GENERATION")));
    expect(outcomes.filter((outcome) => outcome.id)).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome.error === "JobCapacityError")).toHaveLength(4);
    expect(await prisma.backgroundJob.count({ where: { userId, kind: "GENERATION" } })).toBe(2);
    // Capacity is per kind, and counts queued as well as running work.
    await evaluation("1");
    await evaluation("2");
    await expect(evaluation("3")).rejects.toBeInstanceOf(JobCapacityError);
  });

  it("deduplicates concurrent evaluation enqueues across processes", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => childEnqueue("EVALUATION", "42"))
    );
    expect(outcomes.every((outcome) => outcome.id)).toBe(true);
    expect(new Set(outcomes.map((outcome) => outcome.id)).size).toBe(1);
    const persisted = await getEvaluationJob(42, userId);
    expect(persisted?.id).toBe(outcomes[0].id);
    expect(await getJob(persisted!.id, otherUserId)).toBeNull();
    expect(await getJob("not-a-uuid", userId)).toBeNull();
  });

  it("replays generation options while ignoring internal snapshots and rejecting changed options", async () => {
    const input = {
      userId,
      kind: "GENERATION" as const,
      dedupeKey: "client-request",
      payload: { exerciseSlug: "MEMO_EXTRACTION", difficulty: "EASY" }
    };
    const job = await enqueueJob(input);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { payload: { ...input.payload, promptSnapshots: { generator: "pinned" } } }
    });
    expect((await enqueueJob(input)).id).toBe(job.id);
    await expect(
      enqueueJob({ ...input, payload: { ...input.payload, difficulty: "HARD" } })
    ).rejects.toBeInstanceOf(JobConflictError);
    const claimed = (await claimJob())!;
    await failJob(claimed.id, claimed.leaseToken!, "Known failure");
    expect(await enqueueJob(input)).toMatchObject({ id: job.id, status: "FAILED" });
  });

  it("claims each job once and leaves active leases unavailable to other workers", async () => {
    const first = await generation();
    const second = await generation();
    const claimed = await Promise.all(Array.from({ length: 6 }, () => claimJob()));
    const jobs = claimed.filter((job) => job !== null);
    expect(new Set(jobs.map((job) => job.id))).toEqual(new Set([first.id, second.id]));
    expect(jobs).toHaveLength(2);
    expect(
      jobs.every((job) => job.status === "RUNNING" && job.attempts === 1 && job.leaseToken)
    ).toBe(true);
  });

  it("recovers a committed checkpoint after lease expiration and fences the old worker", async () => {
    const queued = await generation();
    const first = (await claimJob())!;
    await saveCheckpoint(first.id, first.leaseToken!, { candidate: { title: "Paid result" } });
    await prisma.backgroundJob.update({
      where: { id: first.id },
      data: { leaseExpiresAt: new Date(0) }
    });
    expect(await renewLease(first.id, first.leaseToken!)).toBe(false);
    const recovered = (await claimJob())!;
    expect(recovered.id).toBe(queued.id);
    expect(recovered.attempts).toBe(2);
    expect(recovered.leaseToken).not.toBe(first.leaseToken);
    expect(recovered.checkpoint).toEqual({ candidate: { title: "Paid result" } });
    await expect(
      saveCheckpoint(first.id, first.leaseToken!, { stale: true })
    ).rejects.toBeInstanceOf(LeaseLostError);
    await expect(finishJob(first.id, first.leaseToken!, { stale: true })).rejects.toBeInstanceOf(
      LeaseLostError
    );
    await expect(failJob(first.id, first.leaseToken!, "stale failure")).rejects.toBeInstanceOf(
      LeaseLostError
    );
    expect(await renewLease(first.id, first.leaseToken!)).toBe(false);
    await finishJob(recovered.id, recovered.leaseToken!, { problemId: "saved" });
    expect(await getJob(recovered.id, userId)).toMatchObject({
      status: "SUCCEEDED",
      result: { problemId: "saved" }
    });
  });

  it("renews a live lease without changing its ownership or claim count", async () => {
    await generation();
    const job = (await claimJob({ leaseMs: 500 }))!;
    expect(await renewLease(job.id, job.leaseToken!, { leaseMs: 2000 })).toBe(true);
    const renewed = (await getJob(job.id, userId))!;
    expect(renewed.leaseExpiresAt!.getTime()).toBeGreaterThan(job.leaseExpiresAt!.getTime());
    expect(renewed.attempts).toBe(1);
    expect(renewed.leaseToken).toBe(job.leaseToken);
    expect(await claimJob()).toBeNull();
  });

  it("rolls back application writes if the lease expires during the final commit", async () => {
    await generation();
    const job = (await claimJob({ leaseMs: 200 }))!;
    await expect(
      withJobLease(job, async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { displayName: "Stale write" } });
        await delay(250);
        await tx.backgroundJob.update({
          where: { id: job.id },
          data: { status: "SUCCEEDED", leaseToken: null, leaseExpiresAt: null }
        });
      })
    ).rejects.toBeInstanceOf(LeaseLostError);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName).toBe(
      "Queue fixture"
    );
    expect((await getJob(job.id, userId))!.status).toBe("RUNNING");
  });

  it("allows application writes and terminal status to commit together under a valid lease", async () => {
    await generation();
    const job = (await claimJob())!;
    await withJobLease(job, async (tx) => {
      await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          result: { committed: true },
          leaseToken: null,
          leaseExpiresAt: null,
          completedAt: new Date()
        }
      });
    });
    expect(await getJob(job.id, userId)).toMatchObject({
      status: "SUCCEEDED",
      result: { committed: true },
      leaseToken: null
    });
  });

  it("fails repeatedly interrupted jobs explicitly and reuses their checkpoint on manual retry", async () => {
    const original = await evaluation();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const job = (await claimJob({ maxAttempts: 2 }))!;
      expect(job.attempts).toBe(attempt);
      if (attempt === 1)
        await saveCheckpoint(job.id, job.leaseToken!, { evaluation: "already paid" });
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { leaseExpiresAt: new Date(0) }
      });
    }
    expect(await claimJob({ maxAttempts: 2 })).toBeNull();
    expect(await getJob(original.id, userId)).toMatchObject({ status: "FAILED", attempts: 2 });
    const retry = await evaluation();
    expect(retry.id).toBe(original.id);
    expect(retry.status).toBe("QUEUED");
    expect(retry.attempts).toBe(0);
    expect(retry.checkpoint).toEqual({ evaluation: "already paid" });
    const claimed = (await claimJob())!;
    await finishJob(claimed.id, claimed.leaseToken!, { evaluationId: "result" });
    expect((await evaluation()).status).toBe("SUCCEEDED");
  });

  it("keeps persisted attempt status consistent when evaluation fails and is retried", async () => {
    const attempt = await attemptFixture();
    await evaluation(String(attempt.id));
    const job = (await claimJob())!;
    await failJob(job.id, job.leaseToken!, "Provider failed");
    expect((await getJob(job.id, userId))!.status).toBe("FAILED");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "EVAL_FAILED"
    );
    const retry = await evaluation(String(attempt.id));
    expect(retry.id).toBe(job.id);
    expect(retry.status).toBe("QUEUED");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "SUBMITTED"
    );
  });

  it("marks the persisted attempt failed when repeated worker crashes exhaust its claims", async () => {
    const attempt = await attemptFixture();
    await evaluation(String(attempt.id));
    const job = (await claimJob({ maxAttempts: 1 }))!;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(0) }
    });
    expect(await claimJob({ maxAttempts: 1 })).toBeNull();
    expect((await getJob(job.id, userId))!.status).toBe("FAILED");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "EVAL_FAILED"
    );
  });

  it("never replaces completed feedback status with failure, retry, or crash exhaustion", async () => {
    const attempt = await attemptFixture();
    await prisma.evaluation.create({
      data: {
        attemptId: attempt.id,
        evaluatorPromptVersionId: evaluatorPromptId,
        model: "fixture",
        overallScore: 8,
        shortDiagnosis: "Complete",
        summary: "Saved feedback",
        topFixes: [],
        rewriteSuggestions: {},
        nextRep: "Next",
        rawOutput: {}
      }
    });
    await prisma.attempt.update({ where: { id: attempt.id }, data: { status: "EVALUATED" } });
    await evaluation(String(attempt.id));
    const job = (await claimJob())!;
    await failJob(job.id, job.leaseToken!, "Late failure");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "EVALUATED"
    );
    await evaluation(String(attempt.id));
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "EVALUATED"
    );
    const reclaimed = (await claimJob({ maxAttempts: 1 }))!;
    await prisma.backgroundJob.update({
      where: { id: reclaimed.id },
      data: { leaseExpiresAt: new Date(0) }
    });
    await claimJob({ maxAttempts: 1 });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "EVALUATED"
    );
  });

  it("persists model step cache keys uniquely while allowing legacy unassociated runs", async () => {
    const job = await generation();
    const data = {
      purpose: "GENERATE_PROBLEM" as const,
      model: "fixture",
      requestPayload: {},
      status: "COMPLETED" as const,
      responsePayload: { output_parsed: { title: "Cached" } },
      backgroundJobId: job.id,
      jobStep: 0
    };
    const row = await prisma.modelRun.create({ data });
    await expect(prisma.modelRun.create({ data })).rejects.toMatchObject({ code: "P2002" });
    expect(
      await prisma.modelRun.findUnique({
        where: { backgroundJobId_jobStep: { backgroundJobId: job.id, jobStep: 0 } }
      })
    ).toMatchObject({ id: row.id, responsePayload: data.responsePayload });
  });
});
