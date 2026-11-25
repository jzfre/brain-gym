import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { startFakeModelServer } from "../tests/helpers/fake-model-server";
import { workflowFixtures } from "../tests/evals/workflow-fixtures";

// Never load .env or fall back to DATABASE_URL. This script creates/deletes
// isolated fixtures and must only run against an explicitly disposable DB.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required and must name a disposable database ending in _test.");
const parsedUrl = new URL(databaseUrl);
if (!/^postgres(ql)?:$/.test(parsedUrl.protocol) || !decodeURIComponent(parsedUrl.pathname).endsWith("_test")) {
  throw new Error("Refusing smoke tests: TEST_DATABASE_URL must name a disposable database ending in _test.");
}
await access(".next/BUILD_ID").catch(() => {
  throw new Error("Run pnpm build before the production HTTP smoke test.");
});

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const userId = randomUUID();
const otherUserId = randomUUID();
const problemId = randomUUID();
const title = `HTTP smoke fixture ${problemId}`;
const hiddenMarker = `hidden-answer-${randomUUID()}`;
const password = `smoke-password-${randomUUID()}`;
let createdExerciseId: string | undefined;
let createdPromptId: string | undefined;
let child: ChildProcess | undefined;
let serverLogs = "";
let interrupted = false;
const modelName = `offline-smoke-${randomUUID()}`;
const generatedIds: string[] = [];
let provider: Awaited<ReturnType<typeof startFakeModelServer>> | undefined;

async function unusedPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopServer() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const force = setTimeout(() => child?.kill("SIGKILL"), 5000);
  try {
    await stopped;
  } finally {
    clearTimeout(force);
  }
}

const onSignal = () => {
  interrupted = true;
  child?.kill("SIGTERM");
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

try {
  // Reuse only the exercise and prompt metadata if already seeded; every
  // problem/user/attempt below belongs to this run and is removed in finally.
  let exercise = await prisma.exerciseType.findUnique({ where: { slug: "MEMO_EXTRACTION" } });
  if (!exercise) {
    createdExerciseId = randomUUID();
    exercise = await prisma.exerciseType.create({
      data: { id: createdExerciseId, slug: "MEMO_EXTRACTION", name: "Memo Extraction", description: "HTTP smoke fixture" }
    });
  }
  let prompt = await prisma.promptVersion.findFirst({
    where: { exerciseTypeId: exercise.id, role: "GENERATOR" }
  });
  if (!prompt) {
    createdPromptId = randomUUID();
    prompt = await prisma.promptVersion.create({
      data: {
        id: createdPromptId, name: "HTTP smoke fixture", role: "GENERATOR",
        exerciseTypeId: exercise.id, content: "Never call a model from this fixture.", active: false
      }
    });
  }
  await prisma.user.createMany({ data: [userId, otherUserId].map((id) => ({
    id, email: `smoke-${id}@example.invalid`, displayName: "HTTP smoke fixture"
  })) });
  const payload = {
    title, timeboxMinutes: 15, userVisiblePrompt: "Compare the proposed options.",
    requiredAnswerSections: [{ order: 1, title: "Recommendation" }], suggestedPacing: []
  };
  await prisma.problem.create({ data: {
    id: problemId, exerciseTypeId: exercise.id, generationPromptVersionId: prompt.id,
    title, promptText: payload.userVisiblePrompt, userVisiblePayload: payload,
    hiddenAnswerKey: { secret: hiddenMarker }, rubric: [], timeboxMinutes: 15,
    suggestedPacing: [], requiredAnswerSections: payload.requiredAnswerSections,
    difficulty: "EASY", uniquenessHash: problemId, generatedByModel: "offline-smoke"
  } });
  const foreignAttempt = await prisma.attempt.create({ data: {
    userId: otherUserId, problemId, responseText: "Another user's answer", timeSpentSeconds: 1
  } });

  const fixturePrefix = randomUUID();
  const outputs: Record<string, unknown> = {};
  for (const [slug, prefix] of [["MEMO_EXTRACTION", "Memo"], ["INCIDENT_RESPONSE", "Incident"], ["LSAT_LOGICAL_REASONING", "Lsat"]] as const) {
    const fixture = structuredClone(workflowFixtures[slug]);
    fixture.generated.title += ` ${fixturePrefix}`;
    outputs[`${prefix}GeneratedProblem`] = fixture.generated;
    outputs[`${prefix}Evaluation`] = fixture.evaluation;
  }
  provider = await startFakeModelServer(outputs);
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl,
      APP_PASSWORD: password, SESSION_SECRET: `smoke-session-${randomUUID()}`,
      LOCAL_USER_ID: userId, OPENAI_API_KEY: "sk-offline-smoke-do-not-use",
      OPENAI_MODEL: modelName, OPENAI_REASONING_EFFORT: "low",
      // All model HTTP calls go to a local deterministic protocol fixture.
      OPENAI_BASE_URL: provider.url, OPENAI_TIMEOUT_MS: "1000",
      OPENAI_EVAL_TIMEOUT_MS: "1000", NEXT_TELEMETRY_DISABLED: "1"
    }
  });
  child.stdout?.on("data", (chunk: Buffer) => { serverLogs = (serverLogs + chunk.toString()).slice(-16_000); });
  child.stderr?.on("data", (chunk: Buffer) => { serverLogs = (serverLogs + chunk.toString()).slice(-16_000); });
  let spawnError: Error | undefined;
  child.on("error", (error) => { spawnError = error; });
  const deadline = Date.now() + 30_000;
  while (true) {
    assert(!interrupted, "Smoke test interrupted");
    if (spawnError) throw spawnError;
    assert(child.exitCode === null && child.signalCode === null, "Production server exited before readiness");
    try {
      const ready = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (ready.ok) break;
    } catch { /* Wait for the HTTP listener and DB readiness. */ }
    assert(Date.now() < deadline, "Production server did not become ready within 30 seconds");
    await delay(200);
  }

  let cookie = "";
  let checks = 0;
  async function request(path: string, status: number, init: RequestInit = {}) {
    assert(!interrupted, "Smoke test interrupted");
    const headers = new Headers(init.headers);
    if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);
    const response = await fetch(`${origin}${path}`, {
      ...init, headers, redirect: "manual", signal: AbortSignal.timeout(10_000)
    });
    const body = await response.text();
    assert.equal(response.status, status, `${init.method ?? "GET"} ${path}: expected ${status}, got ${response.status}`);
    checks++;
    return { response, body };
  }
  const jsonPost = (value: unknown): RequestInit => ({
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value)
  });

  const health = await request("/api/health", 200);
  assert.equal(JSON.parse(health.body).status, "ok");
  assert.equal(health.response.headers.get("cache-control"), "no-store");
  const redirect = await request(`/today?problemId=${problemId}`, 307);
  assert.equal(new URL(redirect.response.headers.get("location")!).searchParams.get("next"), `/today?problemId=${problemId}`);
  await request("/api/history", 401);
  await request("/api/history/leak.json", 401);
  await request("/history/leak.json", 307);
  await request("/login", 200);
  await request("/api/auth/login", 400, jsonPost({}));
  await request("/api/auth/login", 401, jsonPost({ password: "wrong" }));
  const login = await request("/api/auth/login", 200, jsonPost({ password }));
  const setCookie = login.response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.match(setCookie, /Secure/i);
  cookie = setCookie.split(";")[0];
  assert.match(cookie, /^bg_session=\d+\.[a-f0-9]{64}$/);

  for (const path of ["/today", "/history", "/admin/problems", "/admin/prompts"]) {
    await request(path, 200);
  }
  const reopened = await request(`/today?problemId=${problemId}`, 200);
  assert(reopened.body.includes("Ready to start?"), "Saved problem must retain the ready/timer gate");
  assert(reopened.body.includes(title), "Saved problem title must be rendered");
  assert(!reopened.body.includes(hiddenMarker), "Saved problem page must not serialize its answer key");
  const publicProblem = await request(`/api/problems/${problemId}`, 200);
  assert(!publicProblem.body.includes(hiddenMarker), "Problem API must not expose the answer key");
  await request("/today?problemId=bad-id", 404);
  await request("/api/problems/bad-id", 400);
  await request(`/api/problems/${randomUUID()}`, 404);
  await request("/api/problems/generate/unknown-job", 404);
  // Only invalid generation/evaluation requests: no model work is triggered.
  await request("/api/problems/generate", 400, jsonPost({ exerciseSlug: "INVALID", difficulty: "EASY" }));
  await request("/api/attempts/0/evaluate", 400, { method: "POST" });
  await request("/api/attempts", 400, jsonPost({ problemId, responseText: "   ", timeSpentSeconds: 1 }));
  const saved = await request("/api/attempts", 200, jsonPost({
    problemId, responseText: "Choose the reversible option and measure the result.", timeSpentSeconds: 37
  }));
  const attemptId = JSON.parse(saved.body).attemptId as number;
  assert(Number.isSafeInteger(attemptId) && attemptId > 0);
  const detail = await request(`/api/history/${attemptId}`, 200);
  assert.equal(JSON.parse(detail.body).attempt.timeSpentSeconds, 37);
  assert.equal(JSON.parse(detail.body).evaluating, false);
  assert(!detail.body.includes(hiddenMarker), "History API must not expose the answer key");
  const history = await request("/api/history", 200);
  assert(history.body.includes(title), "Saved attempt must appear in history");
  const historyPage = await request(`/history/${attemptId}`, 200);
  assert(historyPage.body.includes("Choose the reversible option"), "History page must show the saved answer");
  await request(`/api/history/${foreignAttempt.id}`, 404);
  await request(`/history/${foreignAttempt.id}`, 404);
  await request(`/api/attempts/${foreignAttempt.id}/evaluate`, 404, { method: "POST" });
  await request("/api/history/2147483648", 400);
  // Exercise the complete pipeline with the actual SDK, validators, background
  // jobs and PostgreSQL. Only the provider's answers are deterministic fixtures.
  for (const [slug, prefix] of [["MEMO_EXTRACTION", "Memo"], ["INCIDENT_RESPONSE", "Incident"], ["LSAT_LOGICAL_REASONING", "Lsat"]] as const) {
    const job = JSON.parse((await request("/api/problems/generate", 202, jsonPost({
      exerciseSlug: slug, difficulty: "EASY"
    }))).body);
    let generatedId: string | undefined;
    for (let poll = 0; poll < 100; poll++) {
      const state = JSON.parse((await request(`/api/problems/generate/${job.jobId}`, 200)).body);
      assert.notEqual(state.status, "failed", `${slug} generation failed: ${state.error}`);
      if (state.status === "succeeded") { generatedId = state.problemId; break; }
      await delay(50);
    }
    assert(generatedId, `${slug} generation did not finish`);
    generatedIds.push(generatedId);
    const stored = await prisma.problem.findUniqueOrThrow({ where: { id: generatedId } });
    let responseText = "Specific evidence, assumptions, tradeoffs and a measurable next test.";
    if (slug === "LSAT_LOGICAL_REASONING") {
      const answers = (stored.hiddenAnswerKey as { answers: Array<{ number: number; correctChoice: string }> }).answers;
      responseText = JSON.stringify({ answers: answers.map((answer) => ({
        number: answer.number, choice: answer.correctChoice, reasoning: "Causality is not established."
      })) });
    }
    const submission = { problemId: generatedId, responseText, timeSpentSeconds: 17, clientSubmissionId: randomUUID() };
    const savedAttempt = JSON.parse((await request("/api/attempts", 200, jsonPost(submission))).body);
    const replay = JSON.parse((await request("/api/attempts", 200, jsonPost(submission))).body);
    assert.equal(replay.attemptId, savedAttempt.attemptId, "Retry must return the committed attempt");
    const countBefore: number = provider.calls.filter((name) => name === `${prefix}Evaluation`).length;
    if (slug === "MEMO_EXTRACTION") {
      provider.failNext.add(`${prefix}Evaluation`);
      await request(`/api/attempts/${savedAttempt.attemptId}/evaluate`, 202, { method: "POST" });
      let failed = false;
      for (let poll = 0; poll < 100; poll++) {
        const state = JSON.parse((await request(`/api/history/${savedAttempt.attemptId}`, 200)).body);
        if (state.attempt.status === "EVAL_FAILED") { failed = true; break; }
        await delay(50);
      }
      assert(failed, "Incomplete model output must leave the saved attempt retryable");
      // JSON-valid but semantically invalid feedback must not become a poisoned
      // completed-response cache that replays forever on every retry.
      const valid = outputs["MemoEvaluation"];
      const bad = structuredClone(valid) as { dimensions: Array<{ name: string }> };
      bad.dimensions[0].name = "Wrong rubric dimension";
      outputs["MemoEvaluation"] = bad;
      await request(`/api/attempts/${savedAttempt.attemptId}/evaluate`, 202, { method: "POST" });
      failed = false;
      for (let poll = 0; poll < 100; poll++) {
        const state = JSON.parse((await request(`/api/history/${savedAttempt.attemptId}`, 200)).body);
        if (state.attempt.status === "EVAL_FAILED" && !state.evaluating) { failed = true; break; }
        await delay(50);
      }
      assert(failed, "Wrong rubric dimensions must fail and permit a fresh model retry");
      outputs["MemoEvaluation"] = valid;
    }
    await request(`/api/attempts/${savedAttempt.attemptId}/evaluate`, 202, { method: "POST" });
    let evaluated = false;
    for (let poll = 0; poll < 100; poll++) {
      const state = JSON.parse((await request(`/api/history/${savedAttempt.attemptId}`, 200)).body);
      assert.notEqual(state.attempt.status, "EVAL_FAILED", `${slug} evaluation failed`);
      if (state.evaluation) {
        assert.equal(state.evaluation.overallScore, slug === "LSAT_LOGICAL_REASONING" ? 10 : 7);
        evaluated = true; break;
      }
      await delay(50);
    }
    assert(evaluated, `${slug} evaluation did not finish`);
    await request(`/api/attempts/${savedAttempt.attemptId}/evaluate`, 200, { method: "POST" });
    assert.equal(provider.calls.filter((name) => name === `${prefix}Evaluation`).length, countBefore + (slug === "MEMO_EXTRACTION" ? 3 : 1));
  }
  // A provider that repeats the same exercise must stop at the retry budget,
  // including when duplicate detection happens before embedding/persistence.
  const duplicateJob = JSON.parse((await request("/api/problems/generate", 202, jsonPost({
    exerciseSlug: "MEMO_EXTRACTION", difficulty: "EASY"
  }))).body);
  let duplicateFailed = false;
  for (let poll = 0; poll < 100; poll++) {
    const state = JSON.parse((await request(`/api/problems/generate/${duplicateJob.jobId}`, 200)).body);
    assert.notEqual(state.status, "succeeded", "Exact duplicate must not save another exercise");
    if (state.status === "failed") { duplicateFailed = true; break; }
    await delay(50);
  }
  assert(duplicateFailed, "Repeated output must exhaust the bounded generation budget");
  assert.equal(provider.calls.filter((name) => name === "MemoGeneratedProblem").length, 4);
  assert.equal(await prisma.problem.count({ where: { generatedByModel: modelName } }), 3);
  assert.equal(await prisma.modelRun.count({ where: { model: modelName, status: "COMPLETED" } }), 9);
  assert.equal(await prisma.modelRun.count({ where: { model: modelName, status: "PENDING" } }), 0);
  assert.equal(await prisma.modelRun.count({ where: { model: modelName, status: "ERROR" } }), 2);
  const logout = await request("/api/auth/logout", 200, { method: "POST" });
  assert.match(logout.response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  cookie = "";
  await request("/api/history", 401);
  await request("/today", 307);
  console.log(`Production HTTP smoke: ${checks} checks passed, all three full exercise workflows (local provider; no paid API calls).`);
} catch (error) {
  if (serverLogs) console.error("Production server output:\n" + serverLogs);
  throw error;
} finally {
  await stopServer();
  await provider?.close();
  try {
    await prisma.attempt.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.problem.deleteMany({ where: { id: { in: [problemId, ...generatedIds] } } });
    await prisma.modelRun.deleteMany({ where: { model: modelName } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    if (createdPromptId) await prisma.promptVersion.deleteMany({ where: { id: createdPromptId } });
    if (createdExerciseId) await prisma.exerciseType.deleteMany({ where: { id: createdExerciseId } });
  } finally {
    await prisma.$disconnect();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
