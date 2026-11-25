import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { startFakeModelServer } from "../tests/helpers/fake-model-server";
import { workflowFixtures } from "../tests/evals/workflow-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !/^postgres(ql)?:$/.test(new URL(databaseUrl).protocol) ||
  !decodeURIComponent(new URL(databaseUrl).pathname).endsWith("_test")
) {
  throw new Error(
    "Restart tests require explicit TEST_DATABASE_URL naming a disposable database ending in _test."
  );
}
await access(".next/BUILD_ID");
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const userId = randomUUID();
const model = `offline-restart-${randomUUID()}`;
const password = `restart-${randomUUID()}`;
const secret = `restart-session-${randomUUID()}`;
const require = createRequire(import.meta.url);
let child: ChildProcess | undefined;
let serverLogs = "";
let interrupted = false;
let releaseAttemptLock: (() => void) | undefined;
let attemptLock: Promise<void> | undefined;
const gates = new Map<string, Promise<void>>();
const releaseGates: Array<() => void> = [];
let provider: Awaited<ReturnType<typeof startFakeModelServer>> | undefined;

function block(name: string): () => void {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  gates.set(name, pending);
  const release = () => {
    gates.delete(name);
    resolve();
  };
  releaseGates.push(release);
  return release;
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T | null | false>,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assert(!interrupted, "Restart smoke interrupted");
    const value = await read();
    if (value) return value;
    await delay(75);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function unusedPort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function stop(signal: "SIGKILL" | "SIGTERM" = "SIGTERM") {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const current = child;
  const exited = new Promise<void>((resolve) => current.once("exit", () => resolve()));
  current.kill(signal);
  const force = setTimeout(() => current.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(force);
}

const port = await unusedPort();
const origin = `http://127.0.0.1:${port}`;
async function start() {
  assert(provider);
  child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        APP_PASSWORD: password,
        SESSION_SECRET: secret,
        LOCAL_USER_ID: userId,
        OPENAI_API_KEY: "sk-offline-restart-do-not-use",
        OPENAI_MODEL: model,
        OPENAI_BASE_URL: provider.url,
        OPENAI_REASONING_EFFORT: "low",
        OPENAI_TIMEOUT_MS: "60000",
        OPENAI_EVAL_TIMEOUT_MS: "60000",
        DEDUP_MAX_RETRIES: "1",
        JOB_LEASE_MS: "1500",
        JOB_POLL_MS: "100",
        NEXT_TELEMETRY_DISABLED: "1"
      }
    }
  );
  child.stdout?.on("data", (chunk: Buffer) => {
    serverLogs = (serverLogs + chunk.toString()).slice(-24_000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    serverLogs = (serverLogs + chunk.toString()).slice(-24_000);
  });
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });
  await waitFor("production readiness", async () => {
    if (spawnError) throw spawnError;
    assert(child?.exitCode === null && child.signalCode === null, "Production server exited");
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      return response.ok;
    } catch {
      return false;
    }
  });
}

let cookie = "";
async function post(path: string, body?: unknown, expected = 202) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  return { data, response };
}
async function completedGeneration(jobId: string): Promise<string> {
  return waitFor("the same generation job to finish", async () => {
    const response = await fetch(`${origin}/api/problems/generate/${jobId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200, "Accepted job must still exist after restart");
    const job = await response.json();
    assert.notEqual(job.status, "failed", JSON.stringify(job));
    return job.status === "succeeded" ? (job.problemId as string) : false;
  });
}
function callCount(name: string) {
  return provider!.calls.filter((call) => call === name).length;
}

async function dropGenerationAcknowledgement(input: unknown) {
  let upstreamError: unknown;
  // A real TCP proxy commits the upstream request, then drops the client
  // connection without forwarding headers/body. The caller never learns jobId.
  const proxy = createHttpServer(async (request, response) => {
    for await (const chunk of request) {
      void chunk; // Consume the client request before dropping the connection.
    }
    try {
      const accepted = await fetch(`${origin}/api/problems/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(10_000)
      });
      assert.equal(accepted.status, 202);
      await accepted.body?.cancel();
    } catch (error) {
      upstreamError = error;
    }
    response.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = proxy.address();
    assert(address && typeof address !== "string");
    await assert.rejects(
      fetch(`http://127.0.0.1:${address.port}`, {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(10_000)
      })
    );
    if (upstreamError) throw upstreamError;
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
}

const onSignal = () => {
  interrupted = true;
  child?.kill("SIGKILL");
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
try {
  // The normal test setup applies migrations and seeds active prompts first.
  for (const slug of ["MEMO_EXTRACTION", "INCIDENT_RESPONSE"] as const) {
    const exercise = await prisma.exerciseType.findUnique({ where: { slug } });
    assert(exercise, "Run pnpm db:seed against the disposable test DB first");
    for (const role of ["GENERATOR", "EVALUATOR"] as const) {
      assert(
        await prisma.promptVersion.findFirst({
          where: { exerciseTypeId: exercise.id, role, active: true }
        }),
        "Seeded active prompts are required"
      );
    }
  }
  await prisma.user.create({
    data: { id: userId, email: `${userId}@restart.invalid`, displayName: "Restart smoke" }
  });
  const outputs: Record<string, unknown> = {};
  for (const [slug, prefix] of [
    ["MEMO_EXTRACTION", "Memo"],
    ["INCIDENT_RESPONSE", "Incident"]
  ] as const) {
    const fixture = structuredClone(workflowFixtures[slug]);
    fixture.generated.title += ` ${model}`;
    outputs[`${prefix}GeneratedProblem`] = fixture.generated;
    outputs[`${prefix}Evaluation`] = fixture.evaluation;
  }
  provider = await startFakeModelServer(outputs, {
    beforeRespond: async (name) => {
      await gates.get(name);
    }
  });
  await start();
  const login = await post("/api/auth/login", { password }, 200);
  cookie = (login.response.headers.get("set-cookie") ?? "").split(";")[0];
  assert(cookie.startsWith("bg_session="));

  // Kill while the remote generation request has no completed response. This
  // ambiguous external call is allowed to run again; the accepted job is not.
  const releaseGeneration = block("IncidentGeneratedProblem");
  const generationRequest = {
    clientGenerationId: randomUUID(),
    exerciseSlug: "INCIDENT_RESPONSE",
    difficulty: "EASY"
  };
  await dropGenerationAcknowledgement(generationRequest);
  await waitFor(
    "unfinished generation provider call",
    async () => callCount("IncidentGeneratedProblem") === 1
  );
  const first = (await post("/api/problems/generate", generationRequest)).data.jobId as string;
  assert.equal(
    await prisma.backgroundJob.count({
      where: { userId, kind: "GENERATION", dedupeKey: generationRequest.clientGenerationId }
    }),
    1
  );
  assert.equal(
    callCount("IncidentGeneratedProblem"),
    1,
    "Retrying a dropped acceptance response must not call the provider again"
  );
  console.log(
    "Acceptance: TCP-dropped generation response retries the same durable job and provider call."
  );
  await stop("SIGKILL");
  const persisted = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: first } });
  assert(["QUEUED", "RUNNING"].includes(persisted.status));
  releaseGeneration();
  await start();
  const incidentProblemId = await completedGeneration(first);
  assert.equal(
    await prisma.problem.count({ where: { id: incidentProblemId, generatedByModel: model } }),
    1
  );
  assert.equal(await prisma.backgroundJob.count({ where: { id: first, userId } }), 1);
  assert.equal(
    callCount("IncidentGeneratedProblem"),
    2,
    "An unfinished call is retried once after lease recovery"
  );
  console.log("Restart: accepted generation survives SIGKILL; one job and one persisted problem.");

  // Kill after the completed Responses output is stored, while the following
  // embedding request is blocked. Replay must use that persisted model result.
  const embeddingsBefore = callCount("embedding");
  const releaseEmbedding = block("embedding");
  const second = (
    await post("/api/problems/generate", { exerciseSlug: "MEMO_EXTRACTION", difficulty: "EASY" })
  ).data.jobId as string;
  await waitFor("generation model checkpoint and blocked embedding", async () => {
    if (callCount("embedding") <= embeddingsBefore) return false;
    return await prisma.modelRun.findFirst({
      where: { backgroundJobId: second, status: "COMPLETED" }
    });
  });
  assert.equal(callCount("MemoGeneratedProblem"), 1);
  await stop("SIGKILL");
  releaseEmbedding();
  await start();
  const memoProblemId = await completedGeneration(second);
  assert.equal(
    callCount("MemoGeneratedProblem"),
    1,
    "Completed generation response must be replayed without another provider call"
  );
  console.log(
    "Restart: completed generation response replayed; provider generation call count stays one."
  );

  // Lock the attempt row to prevent final evaluation persistence, allowing the
  // worker to durably checkpoint its completed model result first.
  const attemptId = (
    await post(
      "/api/attempts",
      {
        problemId: memoProblemId,
        clientSubmissionId: randomUUID(),
        responseText:
          "Continue the controlled pilot, compare like-for-like demand, and stop if costs exceed the observed benefit.",
        timeSpentSeconds: 12
      },
      200
    )
  ).data.attemptId as number;
  let lockAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => {
    lockAcquired = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    releaseAttemptLock = resolve;
  });
  attemptLock = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id = ${attemptId} FOR UPDATE`;
      lockAcquired();
      await hold;
    },
    { timeout: 60_000 }
  );
  await Promise.race([acquired, attemptLock]);
  await post(`/api/attempts/${attemptId}/evaluate`);
  const evaluationJob = await waitFor("evaluation checkpoint", async () => {
    const jobs = await prisma.backgroundJob.findMany({ where: { userId, kind: "EVALUATION" } });
    return (
      jobs.find((job) => (job.checkpoint as { kind?: string } | null)?.kind === "evaluation") ??
      false
    );
  });
  assert.equal(callCount("MemoEvaluation"), 1);
  assert.equal(
    await prisma.evaluation.count({ where: { attemptId } }),
    0,
    "Attempt row lock must hold the final transaction open"
  );
  await stop("SIGKILL");
  releaseAttemptLock!();
  await attemptLock;
  attemptLock = undefined;
  await start();
  await waitFor("checkpointed evaluation after restart", async () =>
    prisma.evaluation.findUnique({ where: { attemptId } })
  );
  const finalJob = await prisma.backgroundJob.findUniqueOrThrow({
    where: { id: evaluationJob.id }
  });
  assert.equal(finalJob.status, "SUCCEEDED");
  assert.equal(await prisma.evaluation.count({ where: { attemptId } }), 1);
  assert.equal(
    callCount("MemoEvaluation"),
    1,
    "Completed evaluation must not call the provider again after restart"
  );
  const history = await fetch(`${origin}/api/history/${attemptId}`, {
    headers: { Cookie: cookie }
  });
  const detail = await history.json();
  assert.equal(detail.attempt.status, "EVALUATED");
  assert.equal(detail.evaluating, false);
  console.log(
    "Restart: checkpointed evaluation completes for the same attempt; provider evaluation call count stays one."
  );
  console.log(
    "Crash/restart smoke passed (real SIGKILL, Postgres, local Responses/embedding provider; no paid model calls)."
  );
} catch (error) {
  if (serverLogs) console.error("Production server output:\n" + serverLogs);
  throw error;
} finally {
  await stop();
  releaseAttemptLock?.();
  await attemptLock?.catch(() => {});
  for (const release of releaseGates) release();
  await provider?.close();
  try {
    await prisma.attempt.deleteMany({ where: { userId } });
    await prisma.problem.deleteMany({ where: { generatedByModel: model } });
    await prisma.modelRun.deleteMany({ where: { model } });
    await prisma.backgroundJob.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await prisma.$disconnect();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
