import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { enqueueJob, claimJob, LeaseLostError } from "@/lib/jobs/store";
import { jobContext } from "@/lib/jobs/context";
import { runStructured } from "@/lib/openai/run-model";
import { loadActivePrompt } from "@/lib/prompts/registry";
import type { BackgroundJob } from "@prisma/client";

const userId = randomUUID();
const schema = z.object({ answer: z.string() });
const payload = { exerciseSlug: "MEMO_EXTRACTION", difficulty: "EASY" };
const scope = (job: BackgroundJob, action: () => Promise<unknown>) =>
  jobContext.run(
    {
      id: job.id,
      leaseToken: job.leaseToken!,
      nextStep: 0,
      signal: new AbortController().signal
    },
    action
  );
const call = (parse: ReturnType<typeof vi.fn>) =>
  runStructured({
    purpose: "GENERATE_PROBLEM",
    model: "offline-checkpoint-test",
    schema,
    schemaName: "CheckpointTest",
    input: "original input",
    client: { responses: { parse } } as never
  });

beforeAll(async () => {
  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.test`, displayName: "Checkpoint tests" }
  });
});
afterEach(async () => {
  await prisma.modelRun.deleteMany({ where: { backgroundJob: { userId } } });
  await prisma.backgroundJob.deleteMany({ where: { userId } });
});
afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
async function claimed() {
  const enqueued = await enqueueJob({ kind: "GENERATION", userId, payload });
  const job = await claimJob();
  expect(job?.id).toBe(enqueued.id);
  return job!;
}
async function recover(job: BackgroundJob) {
  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: { leaseExpiresAt: new Date(0) }
  });
  const recovered = await claimJob();
  expect(recovered?.id).toBe(job.id);
  return recovered!;
}

describe("persisted model checkpoints", () => {
  it("reuses the completed provider response after ownership changes, and pins prompts", async () => {
    const job = await claimed();
    const firstPrompt = await scope(job, () => loadActivePrompt({ role: "BASE" }));
    const parse = vi
      .fn()
      .mockResolvedValue({
        status: "completed",
        output_parsed: { answer: "saved answer" },
        usage: { total_tokens: 5 }
      });
    await scope(job, () => call(parse));
    const next = await recover(job);
    const replay = vi.fn().mockRejectedValue(new Error("must not call provider"));
    const result = await scope(next, () => call(replay));
    expect(result).toMatchObject({ parsed: { answer: "saved answer" } });
    expect(replay).not.toHaveBeenCalled();
    expect(await prisma.modelRun.count({ where: { backgroundJobId: job.id } })).toBe(1);
    expect(await scope(next, () => loadActivePrompt({ role: "BASE" }))).toEqual(firstPrompt);
    const pinned = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(pinned.payload).toHaveProperty("promptSnapshots.BASE::_none");
  });

  it("rejects a late provider response from a worker whose lease was replaced", async () => {
    const job = await claimed();
    let release!: (value: unknown) => void;
    const parse = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pending = scope(job, () => call(parse));
      await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
      await recover(job);
      const rejected = expect(pending).rejects.toBeInstanceOf(LeaseLostError);
      release({ status: "completed", output_parsed: { answer: "stale" } });
      await rejected;
      const row = await prisma.modelRun.findFirstOrThrow({ where: { backgroundJobId: job.id } });
      expect(row.status).toBe("PENDING");
      expect(row.responsePayload).toBeNull();
    } finally {
      log.mockRestore();
    }
  });
});
