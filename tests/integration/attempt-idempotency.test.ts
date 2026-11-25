import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { retryDatabaseOperation } from "@/lib/db/retry";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";

const settings = vi.hoisted(() => ({ localUserId: crypto.randomUUID() }));
vi.mock("@/lib/config", () => ({ getConfig: () => settings }));
import { POST } from "@/app/api/attempts/route";

let problemId: string;
const otherUserId = randomUUID();
const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/attempts", {
      method: "POST",
      body: JSON.stringify({ problemId, responseText: "My answer", timeSpentSeconds: 60, ...body })
    })
  );

beforeAll(async () => {
  const exercise = await prisma.exerciseType.findUniqueOrThrow({
    where: { slug: "MEMO_EXTRACTION" }
  });
  const prompt = await prisma.promptVersion.findFirstOrThrow({
    where: { exerciseTypeId: exercise.id, role: "GENERATOR" }
  });
  await prisma.user.createMany({
    data: [settings.localUserId, otherUserId].map((id) => ({
      id,
      email: `idempotency-${id}@example.invalid`,
      displayName: "Idempotency fixture"
    }))
  });
  const problem = await prisma.problem.create({
    data: {
      exerciseTypeId: exercise.id,
      title: "Idempotency fixture",
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
      generationPromptVersionId: prompt.id
    }
  });
  problemId = problem.id;
});

afterAll(async () => {
  await prisma.attempt.deleteMany({
    where: { userId: { in: [settings.localUserId, otherUserId] } }
  });
  if (problemId) await prisma.problem.delete({ where: { id: problemId } });
  await prisma.user.deleteMany({ where: { id: { in: [settings.localUserId, otherUserId] } } });
  await prisma.$disconnect();
});

describe("attempt idempotency against PostgreSQL", () => {
  it("returns one persisted attempt for concurrent retries of a lost response", async () => {
    const clientSubmissionId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => post({ clientSubmissionId }))
    );
    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(200));
    const ids = await Promise.all(
      responses.map(async (response) => (await response.json()).attemptId)
    );
    expect(new Set(ids).size).toBe(1);
    expect(
      await prisma.attempt.count({ where: { userId: settings.localUserId, clientSubmissionId } })
    ).toBe(1);
  });

  it("preserves the original answer and elapsed time, rejecting reuse with changed content", async () => {
    const clientSubmissionId = randomUUID();
    const original = await (await post({ clientSubmissionId })).json();
    const repeated = await post({
      clientSubmissionId,
      timeSpentSeconds: 120,
      responseText: "  My answer  "
    });
    expect(await repeated.json()).toEqual(original);
    const changed = await post({ clientSubmissionId, responseText: "Different answer" });
    expect(changed.status).toBe(409);
    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: original.attemptId } });
    expect(stored.responseText).toBe("My answer");
    expect(stored.timeSpentSeconds).toBe(60);
  });

  it("rejects conflicting content even when two requests race on the same key", async () => {
    const clientSubmissionId = randomUUID();
    const responses = await Promise.all([
      post({ clientSubmissionId, responseText: "First answer" }),
      post({ clientSubmissionId, responseText: "Second answer" })
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.attempt.count({ where: { userId: settings.localUserId, clientSubmissionId } })
    ).toBe(1);
  });

  it("recovers an atomic save after its own PostgreSQL connection is terminated", async () => {
    const control = new PrismaClient();
    const clientSubmissionId = randomUUID();
    let tries = 0;
    try {
      const attempt = await retryDatabaseOperation(() =>
        prisma.$transaction(async (tx) => {
          tries++;
          if (tries === 1) {
            const [{ pid }] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            // Terminate only this test's transaction-owned backend, never the
            // database server or another test's session.
            await control.$queryRaw`SELECT pg_terminate_backend(${pid}::int)`;
          }
          return tx.attempt.create({
            data: {
              userId: settings.localUserId,
              clientSubmissionId,
              problemId,
              responseText: "Recovered persisted result",
              timeSpentSeconds: 5
            }
          });
        })
      );
      expect(tries).toBe(2);
      expect(attempt.responseText).toBe("Recovered persisted result");
      expect(
        await prisma.attempt.count({ where: { userId: settings.localUserId, clientSubmissionId } })
      ).toBe(1);
    } finally {
      await control.$disconnect();
    }
  });

  it("scopes the unique submission key to each user", async () => {
    const clientSubmissionId = randomUUID();
    expect((await post({ clientSubmissionId })).status).toBe(200);
    await expect(
      prisma.attempt.create({
        data: {
          userId: otherUserId,
          clientSubmissionId,
          problemId,
          responseText: "Another user's answer",
          timeSpentSeconds: 5
        }
      })
    ).resolves.toHaveProperty("id");
  });
});
