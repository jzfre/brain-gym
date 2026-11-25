import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const db = process.env.TEST_DATABASE_URL;
if (
  !db ||
  !/^postgres(ql)?:$/.test(new URL(db).protocol) ||
  !decodeURIComponent(new URL(db).pathname).endsWith("_test")
)
  throw new Error("Explicit disposable TEST_DATABASE_URL ending in _test required");
await access(".next/BUILD_ID");
const prisma = new PrismaClient({ datasources: { db: { url: db } } });
const userId = randomUUID(),
  memoId = randomUUID(),
  lsatId = randomUUID(),
  incidentId = randomUUID();
const problemIds = [memoId, lsatId, incidentId],
  createdPrompts = [],
  createdExercises = [];
let child, browser, activePage;
let interrupted = false;
const onSignal = () => {
  interrupted = true;
  void browser?.close();
  child?.kill("SIGTERM");
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
const listener = createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve, reject) =>
  listener.close((error) => (error ? reject(error) : resolve()))
);
const origin = `http://127.0.0.1:${port}`;
const findings = [];
const note = (label, details) => {
  findings.push({ label, details });
  console.log(label + ": " + JSON.stringify(details));
};
const artifacts = join(tmpdir(), `brain-gym-browser-${userId}`);
await mkdir(artifacts, { recursive: true });
try {
  await prisma.user.create({
    data: { id: userId, email: `browser-${userId}@example.invalid`, displayName: "Browser review" }
  });
  for (const [slug, id] of [
    ["MEMO_EXTRACTION", memoId],
    ["LSAT_LOGICAL_REASONING", lsatId],
    ["INCIDENT_RESPONSE", incidentId]
  ]) {
    let ex = await prisma.exerciseType.findUnique({ where: { slug } });
    if (!ex) {
      ex = await prisma.exerciseType.create({
        data: { slug, name: slug, description: "browser fixture" }
      });
      createdExercises.push(ex.id);
    }
    let prompt = await prisma.promptVersion.findFirst({
      where: { exerciseTypeId: ex.id, role: "GENERATOR" }
    });
    if (!prompt) {
      prompt = await prisma.promptVersion.create({
        data: {
          exerciseTypeId: ex.id,
          role: "GENERATOR",
          name: "browser fixture",
          content: "unused",
          active: false
        }
      });
      createdPrompts.push(prompt.id);
    }
    const payload = {
      title: `Browser ${slug}`,
      timeboxMinutes: 15,
      userVisiblePrompt: "Compare the evidence and select the most justified conclusion.",
      requiredAnswerSections: [
        { order: 1, title: "Claim" },
        { order: 2, title: "Evidence" }
      ],
      suggestedPacing: [],
      ...(slug === "LSAT_LOGICAL_REASONING"
        ? {
            questions: [1, 2, 3].map((number) => ({
              number,
              stimulus: `Argument number ${number}: all red boxes are heavy, and this box is red.`,
              questionStem: "Which conclusion is supported?",
              choices: {
                A: "The box is heavy",
                B: "The box is light",
                C: "All boxes are red",
                D: "No boxes are heavy",
                E: "The box is blue"
              },
              questionType: "Inference"
            }))
          }
        : {})
    };
    await prisma.problem.create({
      data: {
        id,
        exerciseTypeId: ex.id,
        generationPromptVersionId: prompt.id,
        title: payload.title,
        promptText: payload.userVisiblePrompt,
        userVisiblePayload: payload,
        hiddenAnswerKey: {
          answers: [1, 2, 3].map((number) => ({
            number,
            correctChoice: "A",
            explanation: "Red boxes are heavy."
          }))
        },
        rubric: [],
        timeboxMinutes: 15,
        suggestedPacing: [],
        requiredAnswerSections: payload.requiredAnswerSections,
        difficulty: "EASY",
        uniquenessHash: id,
        generatedByModel: "browser-fixture"
      }
    });
  }
  assert(!interrupted, "Browser smoke interrupted");
  child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: db,
        NODE_ENV: "production",
        LOCAL_USER_ID: userId,
        APP_PASSWORD: "browser-review-password",
        SESSION_SECRET: "browser-review-secret-at-least-32-characters",
        OPENAI_API_KEY: "sk-offline",
        OPENAI_MODEL: "offline",
        OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
        OPENAI_TIMEOUT_MS: "1000",
        OPENAI_EVAL_TIMEOUT_MS: "1000",
        NEXT_TELEMETRY_DISABLED: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let logs = "";
  child.stdout.on("data", (x) => (logs += x));
  child.stderr.on("data", (x) => (logs += x));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) break;
    } catch {}
    await sleep(250);
    if (i === 59) throw new Error(logs);
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Evaluation kickoff is intentionally blocked: these browser checks exercise
  // persistence/recovery, not provider quality. The HTTP smoke covers the SDK.
  await context.route("**/api/attempts/*/evaluate", (route) =>
    route.fulfill({ status: 503, body: "offline browser fixture" })
  );
  async function signIn(target = page) {
    await target.getByLabel("Password").fill("browser-review-password");
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await target.waitForURL((url) => url.pathname !== "/login");
  }
  async function openProblem(id) {
    await page.goto(origin + `/today?problemId=${id}`);
    const start = page.getByRole("button", { name: "Start exercise", exact: true });
    await start.waitFor();
    await start.click();
  }
  const key = (id) => `brain-gym:draft:v1:${id}`;
  await page.goto(origin + "/login");
  await signIn();
  await page.goto(origin + `/today?problemId=${memoId}`);
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator("span.font-mono").count(), 0, "Timer must not run before Start");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(() => !document.activeElement?.closest("header")),
      "Ready dialog must keep focus out of background navigation"
    );
  }
  await page.getByRole("button", { name: "Start exercise", exact: true }).click();
  await page.locator("#memo-0").fill("Preserve this claim through a reload.");
  await page.locator("#memo-1").fill("Revenue rose by 12 percent.");
  await page.waitForTimeout(1250);
  assert.notEqual(await page.locator("span.font-mono").first().textContent(), "00:00");
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key(memoId));
  await page.screenshot({ path: join(artifacts, "memo-before-reload.png") });
  await page.reload();
  await page.locator("#memo-0").waitFor();
  assert.equal(await page.locator("#memo-0").inputValue(), "Preserve this claim through a reload.");
  assert.equal(await page.locator("#memo-1").inputValue(), "Revenue rose by 12 percent.");
  const restored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key(memoId));
  assert.equal(restored.startedAt, stored.startedAt, "Reload must preserve timer origin");
  assert.equal(
    restored.clientSubmissionId,
    stored.clientSubmissionId,
    "Reload must preserve submission identity"
  );
  assert.equal(await page.getByRole("dialog").count(), 0, "Started exercise resumes directly");
  await page.screenshot({ path: join(artifacts, "memo-after-reload.png") });
  note("memo readiness, focus, timer and reload persistence", "passed");
  await page.locator("#memo-0").fill("Preserve through navigation.");
  await page.getByRole("link", { name: "History", exact: true }).first().click();
  await page.waitForURL("**/history");
  await page.goBack();
  await page.locator("#memo-0").waitFor();
  assert.equal(await page.locator("#memo-0").inputValue(), "Preserve through navigation.");
  note("memo navigation persistence", "passed");
  await page.locator("#memo-0").fill("Important answer before expiry.");
  await context.clearCookies();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByText(/Your session expired/).waitFor();
  assert.equal(await page.locator("#memo-0").inputValue(), "Important answer before expiry.");
  await page.getByRole("link", { name: "Sign in again", exact: true }).click();
  await page.waitForURL("**/login?*");
  await signIn();
  await page.locator("#memo-0").waitFor();
  assert.equal(await page.locator("#memo-0").inputValue(), "Important answer before expiry.");
  note("expired session and reauthentication retain draft", "passed");
  // Real backend commits the first save; the browser then loses its response.
  await page.locator("#memo-0").fill("The network dropped the save response.");
  await page.route("**/api/attempts", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByText("Failed to fetch", { exact: true }).waitFor();
  assert.equal(await prisma.attempt.count({ where: { userId, problemId: memoId } }), 1);
  await page.unroute("**/api/attempts");
  await page.reload();
  await page.locator("#memo-0").waitFor();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.waitForURL(/\/history\/\d+$/);
  await page.getByText("Evaluation was interrupted", { exact: true }).waitFor();
  assert.equal(
    await prisma.attempt.count({ where: { userId, problemId: memoId } }),
    1,
    "Retry after a lost save response must not duplicate the attempt"
  );
  assert.equal(
    await page.evaluate((k) => localStorage.getItem(k), key(memoId)),
    null,
    "Confirmed submission clears draft"
  );
  await page.reload();
  await page.getByText("The network dropped the save response.", { exact: false }).waitFor();
  note(
    "committed-save lost response retries once, survives reload, and clears confirmed draft",
    "passed"
  );
  await openProblem(lsatId);
  await page.getByRole("radio", { name: "A. The box is heavy" }).check();
  await page.getByLabel(/Reason/).fill("All red boxes are heavy, and this one is red.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "B. The box is light" }).check();
  await page.getByLabel(/Reason/).fill("A deliberately incorrect answer for navigation.");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  assert(await page.getByRole("radio", { name: "A. The box is heavy" }).isChecked());
  assert.equal(
    await page.getByLabel(/Reason/).inputValue(),
    "All red boxes are heavy, and this one is red."
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload();
  await page.getByText(/Question 2 of 3/).waitFor();
  assert(await page.getByRole("radio", { name: "B. The box is light" }).isChecked());
  assert.equal(
    await page.getByLabel(/Reason/).inputValue(),
    "A deliberately incorrect answer for navigation."
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "C. All boxes are red" }).check();
  await page.getByLabel(/Reason/).fill("A third answer for complete submission.");
  await page.getByRole("button", { name: "Submit all 3", exact: true }).click();
  await page.waitForURL(/\/history\/\d+$/);
  const lsatAttempt = await prisma.attempt.findFirstOrThrow({
    where: { userId, problemId: lsatId }
  });
  const lsatAnswers = JSON.parse(lsatAttempt.responseText).answers;
  assert.deepEqual(
    lsatAnswers.map((answer) => answer.choice),
    ["A", "B", "C"]
  );
  assert.equal(lsatAnswers[0].reasoning, "All red boxes are heavy, and this one is red.");
  note("LSAT Back/Next, reload position, all choices/reasons submitted intact", "passed");
  await openProblem(incidentId);
  await page.getByRole("textbox").fill("Contain the outage, then investigate the trigger.");
  await page.reload();
  await page.getByRole("textbox").waitFor();
  assert.equal(
    await page.getByRole("textbox").inputValue(),
    "Contain the outage, then investigate the trigger."
  );
  note("incident freeform reload persistence", "passed");
  // Corrupt storage is ignored; it must never crash the exercise screen.
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key(memoId));
  await openProblem(memoId);
  assert.equal(await page.locator("#memo-0").inputValue(), "");
  await page.evaluate((k) => localStorage.removeItem(k), key(memoId));
  // Stub generation transport, then use real persisted public problems. A
  // reload, auth round trip or visit to another exercise must never POST again.
  const generationId = randomUUID();
  const pendingKey = "brain-gym:generation:v1";
  let generationPosts = 0;
  const generationRequestIds = [];
  let generationReady = false;
  let generationAuthExpired = false;
  let generationPolls = 0;
  await page.route("**/api/problems/generate", (route) => {
    generationPosts++;
    generationRequestIds.push(route.request().postDataJSON().clientGenerationId);
    if (generationPosts === 1) return route.abort("failed");
    return route.fulfill({ status: 202, json: { jobId: generationId } });
  });
  await page.route(`**/api/problems/generate/${generationId}`, (route) => {
    generationPolls++;
    return generationAuthExpired
      ? route.fulfill({ status: 401, json: { error: "unauthorized" } })
      : route.fulfill({
          json: generationReady ? { status: "succeeded", problemId: memoId } : { status: "pending" }
        });
  });
  await page.goto(origin + "/today");
  await page.getByRole("button", { name: "Generate problem", exact: true }).click();
  await page.getByText("Error: Failed to fetch", { exact: true }).waitFor();
  const unacknowledgedId = new URL(page.url()).searchParams.get("generationId");
  assert(unacknowledgedId, "Request identity must be persisted before sending the POST");
  await page.reload();
  await page.waitForURL(`**/today?jobId=${generationId}`);
  assert.deepEqual(generationRequestIds, [unacknowledgedId, unacknowledgedId]);
  assert.equal(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).jobId, pendingKey),
    generationId
  );
  await page.reload();
  await page.getByText("Your generation request is saved.", { exact: false }).waitFor();
  assert.equal(generationPosts, 2, "Reload must resume polling, never create another generation");
  // Expire the session during polling; sign-in must return to the same job.
  await context.clearCookies();
  generationAuthExpired = true;
  await page.getByText(/Your session expired/).waitFor();
  await page.getByRole("link", { name: "Sign in again", exact: true }).click();
  await page.waitForURL("**/login?*");
  generationAuthExpired = false;
  await signIn();
  await page.getByText("Your generation request is saved.", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("jobId"), generationId);
  assert.equal(generationPosts, 2);
  assert(generationPolls > 0);
  // Explicit problemId wins over a pending unrelated generation.
  await page.goto(origin + `/today?problemId=${incidentId}`);
  await page.getByRole("textbox").waitFor();
  assert.equal(
    await page.getByRole("textbox").inputValue(),
    "Contain the outage, then investigate the trigger."
  );
  generationReady = true;
  // A bare Today visit discovers the completed stored job, even without jobId.
  await page.goto(origin + "/today");
  await page.getByRole("button", { name: "Start exercise", exact: true }).waitFor();
  assert.equal(generationPosts, 2);
  assert.equal(new URL(page.url()).searchParams.get("problemId"), memoId);
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), pendingKey), null);
  await page.getByRole("button", { name: "Start exercise", exact: true }).click();
  await page.locator("#memo-0").fill("Resume this newly generated exercise.");
  await page.reload();
  await page.locator("#memo-0").waitFor();
  assert.equal(await page.locator("#memo-0").inputValue(), "Resume this newly generated exercise.");
  note(
    "unacknowledged request retries its original ID; accepted job reload/auth never reposts",
    "passed"
  );
  // A persisted failed job is surfaced once and permits a deliberate new job.
  const failedJobId = randomUUID();
  await page.route(`**/api/problems/generate/${failedJobId}`, (route) =>
    route.fulfill({ json: { status: "failed", error: "Fixture generation failed" } })
  );
  await page.evaluate(
    ({ key, id }) => localStorage.setItem(key, JSON.stringify({ version: 1, jobId: id })),
    { key: pendingKey, id: failedJobId }
  );
  await page.goto(origin + "/today");
  await page.getByText("Error: Fixture generation failed", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Generate problem", exact: true }).isEnabled());
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), pendingKey), null);
  assert.equal(generationPosts, 2);
  note("persisted completed/failed jobs recover, explicit problem URL takes precedence", "passed");
  const blocked = await browser.newContext();
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      }
    })
  );
  const blockedPage = await blocked.newPage();
  blockedPage.on("pageerror", (e) => errors.push(e.message));
  await blockedPage.goto(origin + `/today?problemId=${memoId}`);
  await signIn(blockedPage);
  await blockedPage.getByRole("button", { name: "Start exercise", exact: true }).click();
  await blockedPage.getByText(/browser couldn’t save this draft/).waitFor();
  await blockedPage.locator("#memo-0").fill("Editing still works without storage.");
  assert.equal(
    await blockedPage.locator("#memo-0").inputValue(),
    "Editing still works without storage."
  );
  await blocked.close();
  note("blocked storage degrades visibly without preventing editing", "passed");
  assert.deepEqual(errors, [], "No browser JavaScript errors");
  await writeFile(join(artifacts, "results.json"), JSON.stringify(findings, null, 2));
  console.log(`Browser smoke passed. Screenshots and results: ${artifacts}`);
} catch (error) {
  await activePage
    ?.screenshot({ path: join(artifacts, "failure.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    join(artifacts, "failure.json"),
    JSON.stringify({ findings, error: String(error) }, null, 2)
  );
  console.error(`Browser failure evidence: ${artifacts}`);
  throw error;
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(force);
  }
  try {
    await prisma.attempt.deleteMany({ where: { userId } });
    await prisma.problem.deleteMany({ where: { id: { in: problemIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.promptVersion.deleteMany({ where: { id: { in: createdPrompts } } });
    await prisma.exerciseType.deleteMany({ where: { id: { in: createdExercises } } });
  } finally {
    await prisma.$disconnect();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
