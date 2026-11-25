import { Prisma, type BackgroundJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";

const deps = vi.hoisted(() => ({
  generate: vi.fn(),
  evaluate: vi.fn(),
  avoidance: vi.fn(),
  prompt: vi.fn(),
  exerciseType: vi.fn(),
  create: vi.fn(),
  source: vi.fn(),
  embedding: vi.fn(),
  findMany: vi.fn(),
  findProblem: vi.fn(),
  findAttempt: vi.fn(),
  findEvaluation: vi.fn(),
  createEvaluation: vi.fn(),
  createDimension: vi.fn(),
  updateAttempt: vi.fn(),
  checkpoint: vi.fn(),
  complete: vi.fn(),
  finish: vi.fn(),
  lease: vi.fn(),
  modelRun: vi.fn()
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    exerciseType: { findUniqueOrThrow: deps.exerciseType },
    problem: { findMany: deps.findMany },
    attempt: { findUnique: deps.findAttempt },
    modelRun: { findUnique: deps.modelRun },
    $executeRaw: deps.embedding
  }
}));
vi.mock("@/lib/jobs/store", () => ({
  saveCheckpoint: deps.checkpoint,
  finishJob: deps.finish,
  withJobLease: deps.lease
}));
vi.mock("@/lib/config", () => ({
  getConfig: () => ({
    openai: { model: "current-config-model" },
    dedup: { similarityThreshold: 0.85, maxRetries: 3, neighborK: 5 }
  })
}));
vi.mock("@/lib/exercises/registry", () => ({
  getMode: () => ({ generate: vi.fn(), evaluate: deps.evaluate })
}));
vi.mock("@/lib/memory/avoidance", () => ({ loadAvoidanceHint: deps.avoidance }));
vi.mock("@/lib/prompts/registry", () => ({ loadActivePrompt: deps.prompt }));
vi.mock("@/lib/memory/dedup", () => ({ generateUniqueProblem: deps.generate }));
vi.mock("@/lib/memory/embedding", () => ({ embedText: vi.fn(), problemEmbeddingText: vi.fn() }));
vi.mock("@/lib/memory/similarity", () => ({ findSimilarProblems: vi.fn() }));
import { processJob } from "@/lib/jobs/handlers";

const problem = {
  title: "Exercise",
  difficulty: "MEDIUM",
  timeboxMinutes: 10,
  suggestedPacing: [],
  userVisiblePrompt: "Reason about this",
  requiredAnswerSections: [],
  rubric: { dimensions: [] },
  tags: [],
  hiddenAnswerKey: { secret: "answer" },
  sourceCitations: [{ url: "https://example.com" }]
};
const evaluation = {
  overallScore: 8,
  shortDiagnosis: "Good reasoning",
  summary: "A useful summary",
  topFixes: ["Be more specific"],
  rewriteSuggestions: {},
  nextRep: "Try another",
  errorPatternTags: [],
  missClassifications: [],
  dimensions: [{ name: "Clarity", score: 8, rationale: "Clear", exampleResponse: "Example" }]
};
const generationJob: BackgroundJob = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "GENERATION",
  status: "RUNNING",
  userId: "local-user",
  payload: { exerciseSlug: "MEMO_EXTRACTION", difficulty: "MEDIUM" },
  checkpoint: null,
  result: null,
  error: null,
  dedupeKey: null,
  leaseToken: "00000000-0000-4000-8000-000000000002",
  leaseExpiresAt: new Date(Date.now() + 60_000),
  attempts: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null
};
const evaluationJob = { ...generationJob, kind: "EVALUATION" as const, payload: { attemptId: 7 } };
const transientFailure = () =>
  new Prisma.PrismaClientKnownRequestError("connection lost", {
    code: "P1017",
    clientVersion: "test"
  });

beforeEach(() => {
  vi.resetAllMocks();
  deps.avoidance.mockResolvedValue({
    recentTitles: [],
    recentTags: [],
    recentHashes: [],
    recentSourceUrls: []
  });
  deps.exerciseType.mockResolvedValue({ id: "exercise-type" });
  deps.prompt.mockResolvedValue({ id: "prompt-version" });
  deps.modelRun.mockResolvedValue({ model: "actual-model" });
  deps.generate.mockResolvedValue({
    result: { problem, modelRunId: "paid-run" },
    attemptsUsed: 1,
    embedding: [1, 0],
    isNearDuplicate: false,
    nearestSimilarity: 0
  });
  deps.create.mockResolvedValue({ id: "problem-id" });
  deps.findProblem.mockResolvedValue(null);
  deps.findMany.mockResolvedValue([]);
  deps.findAttempt.mockResolvedValue({
    id: 7,
    responseText: "My answer",
    evaluation: null,
    problem: {
      exerciseType: { slug: "MEMO_EXTRACTION" },
      userVisiblePayload: { title: "Exercise" },
      hiddenAnswerKey: { secret: "key" }
    }
  });
  deps.findEvaluation.mockResolvedValue(null);
  deps.createEvaluation.mockResolvedValue({ id: "evaluation-id" });
  deps.evaluate.mockResolvedValue({ evaluation, modelRunId: "paid-evaluation" });
  // Store's actual fencing/atomic rollback is exercised against PostgreSQL in
  // durable-jobs.test.ts. This facade isolates handler decisions and model cost.
  deps.lease.mockImplementation(async (_job, commit) =>
    commit({
      problem: { create: deps.create, findUnique: deps.findProblem },
      problemSource: { create: deps.source },
      evaluation: { create: deps.createEvaluation, findUnique: deps.findEvaluation },
      evaluationDimension: { create: deps.createDimension },
      attempt: { update: deps.updateAttempt },
      backgroundJob: { update: deps.complete }
    })
  );
});

describe("durable generation handler", () => {
  it("checkpoints the paid candidate before committing the problem and job result together", async () => {
    await processJob(generationJob);
    expect(deps.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.create.mock.invocationCallOrder[0]
    );
    expect(deps.create.mock.calls[0][0].data.userVisiblePayload).not.toHaveProperty(
      "hiddenAnswerKey"
    );
    expect(deps.create.mock.calls[0][0].data.hiddenAnswerKey).toEqual(problem.hiddenAnswerKey);
    expect(deps.create.mock.calls[0][0].data.generatedByModel).toBe("actual-model");
    expect(deps.source).toHaveBeenCalledOnce();
    expect(deps.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED", result: { problemId: "problem-id" } })
      })
    );
  });

  it("resumes a persisted candidate without another generation call", async () => {
    deps.create.mockRejectedValueOnce(new Error("write failed"));
    await expect(processJob(generationJob)).rejects.toThrow("write failed");
    const checkpoint = deps.checkpoint.mock.calls[0][2];
    deps.generate.mockClear();
    await processJob({ ...generationJob, checkpoint });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.create.mock.calls[1][0].data.id).toBe(checkpoint.candidateId);
    expect(deps.complete).toHaveBeenCalledOnce();
  });

  it("recovers transient persistence failure with the same candidate and no additional model call", async () => {
    deps.create.mockRejectedValueOnce(transientFailure());
    await processJob(generationJob);
    expect(deps.generate).toHaveBeenCalledOnce();
    expect(deps.create).toHaveBeenCalledTimes(2);
    expect(deps.create.mock.calls[0][0].data.id).toBe(deps.create.mock.calls[1][0].data.id);
  });

  it("keeps the committed problem when optional embedding persistence fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.embedding.mockRejectedValueOnce(new Error("vector extension error"));
    await expect(processJob(generationJob)).resolves.toBeUndefined();
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("retries a concurrent exact collision within the remaining generation budget", async () => {
    deps.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("collision", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["exerciseTypeId", "uniquenessHash"] }
      })
    );
    await processJob(generationJob);
    expect(deps.generate).toHaveBeenCalledTimes(2);
    expect(deps.generate.mock.calls[1][0].config.maxRetries).toBe(2);
    expect(deps.generate.mock.calls[1][0].input.avoidanceHint.recentTitles).toContain(
      problem.title
    );
  });

  it("compares actual LSAT questions when checking old saved hashes", async () => {
    await processJob(generationJob);
    const check = deps.generate.mock.calls[0][0].deps.isExactDuplicate;
    const base = { title: "Set", userVisiblePrompt: "Answer five questions", tags: ["flaw"] };
    const question = {
      stimulus: "If P then Q",
      questionStem: "What follows?",
      choices: { A: "P", B: "Q" }
    };
    const legacyHash = computeUniquenessHash({
      title: base.title,
      promptText: base.userVisiblePrompt,
      tags: base.tags
    });
    deps.findMany.mockResolvedValue([
      {
        ...base,
        promptText: base.userVisiblePrompt,
        uniquenessHash: legacyHash,
        userVisiblePayload: { questions: [question] }
      }
    ]);
    expect(await check({ ...base, questions: [question] })).toBe(true);
    expect(
      await check({ ...base, questions: [{ ...question, stimulus: "All mammals are animals." }] })
    ).toBe(false);
  });
});

describe("durable evaluation handler", () => {
  it("persists checkpoint first and then feedback, dimensions, attempt and job status atomically", async () => {
    await processJob(evaluationJob);
    expect(deps.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(
      deps.createEvaluation.mock.invocationCallOrder[0]
    );
    expect(deps.evaluate).toHaveBeenCalledWith({
      problem: { title: "Exercise", hiddenAnswerKey: { secret: "key" } },
      userAnswer: "My answer"
    });
    expect(deps.createEvaluation).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 7,
        overallScore: 8,
        model: "actual-model",
        rawOutput: evaluation
      })
    });
    expect(deps.createDimension).toHaveBeenCalledWith({
      data: {
        evaluationId: "evaluation-id",
        dimension: "Clarity",
        score: 8,
        rationale: "Clear",
        exampleResponse: "Example"
      }
    });
    expect(deps.updateAttempt).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: "EVALUATED" }
    });
    expect(deps.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          result: { evaluationId: "evaluation-id" }
        })
      })
    );
  });

  it("resumes checkpointed feedback without paying to evaluate again", async () => {
    deps.createEvaluation.mockRejectedValueOnce(new Error("write failed"));
    await expect(processJob(evaluationJob)).rejects.toThrow("write failed");
    const checkpoint = deps.checkpoint.mock.calls[0][2];
    deps.evaluate.mockClear();
    await processJob({ ...evaluationJob, checkpoint });
    expect(deps.evaluate).not.toHaveBeenCalled();
    expect(deps.createEvaluation).toHaveBeenCalledTimes(2);
  });

  it("retries temporary database errors without another evaluator call", async () => {
    deps.createEvaluation.mockRejectedValueOnce(transientFailure());
    await processJob(evaluationJob);
    expect(deps.evaluate).toHaveBeenCalledOnce();
    expect(deps.createEvaluation).toHaveBeenCalledTimes(2);
  });

  it("recognizes already persisted feedback and does not call the model", async () => {
    deps.findAttempt.mockResolvedValueOnce({ id: 7, evaluation: { id: "existing-evaluation" } });
    await processJob(evaluationJob);
    expect(deps.evaluate).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(evaluationJob.id, evaluationJob.leaseToken, {
      evaluationId: "existing-evaluation"
    });
  });
});
