import { randomUUID } from "node:crypto";
import { retryDatabaseOperation } from "@/lib/db/retry";
import { Difficulty, ExerciseSlug, PromptRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import type { GeneratedProblemCommon } from "@/lib/exercises/types";
import { getMode } from "@/lib/exercises/registry";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { generateUniqueProblem } from "@/lib/memory/dedup";
import { embedText, problemEmbeddingText } from "@/lib/memory/embedding";
import { findSimilarProblems } from "@/lib/memory/similarity";

import type { BackgroundJob } from "@prisma/client";
import type { DedupOutcome } from "@/lib/memory/dedup";
import type { GenerateInput } from "@/lib/exercises/types";
import { saveCheckpoint, withJobLease, finishJob } from "./store";
import { jobContext } from "./context";

type GenerationCheckpoint = {
  kind: "generation";
  remainingAttempts: number;
  avoidanceHint: GenerateInput["avoidanceHint"];
  modelStep: number;
  outcome?: DedupOutcome;
  candidateId?: string;
  promptId?: string;
  exerciseTypeId: string;
  model: string;
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function completeData(result: Prisma.InputJsonValue) {
  return {
    status: "SUCCEEDED" as const,
    result,
    error: null,
    completedAt: new Date(),
    leaseToken: null,
    leaseExpiresAt: null
  };
}

async function generate(job: BackgroundJob): Promise<void> {
  const { exerciseSlug, difficulty } = job.payload as {
    exerciseSlug: ExerciseSlug;
    difficulty: Difficulty;
  };
  const mode = getMode(exerciseSlug);
  let saved = job.checkpoint as unknown as GenerationCheckpoint | null;
  let avoidanceHint = saved?.avoidanceHint ?? (await loadAvoidanceHint({ exerciseSlug }));
  const cfg = getConfig();
  const exerciseType = await prisma.exerciseType.findUniqueOrThrow({
    where: { slug: exerciseSlug }
  });

  let remainingAttempts = saved?.remainingAttempts ?? cfg.dedup.maxRetries;
  while (remainingAttempts > 0 || saved?.outcome) {
    const outcome =
      saved?.outcome ??
      (await generateUniqueProblem({
        input: { difficulty, avoidanceHint },
        config: { threshold: cfg.dedup.similarityThreshold, maxRetries: remainingAttempts },
        deps: {
          generate: (i) => mode.generate(i),
          isExactDuplicate: async (problem) => {
            const input = {
              title: problem.title,
              promptText: problem.userVisiblePrompt,
              tags: problem.tags
            };
            const hash = computeUniquenessHash({ ...input, questions: problem.questions });
            const legacyHash = computeUniquenessHash(input);
            const candidates = await prisma.problem.findMany({
              where: {
                exerciseTypeId: exerciseType.id,
                uniquenessHash: { in: [hash, legacyHash] }
              },
              select: {
                uniquenessHash: true,
                title: true,
                promptText: true,
                tags: true,
                userVisiblePayload: true
              }
            });
            return candidates.some(
              (candidate) =>
                candidate.uniquenessHash === hash ||
                computeUniquenessHash({
                  title: candidate.title,
                  promptText: candidate.promptText,
                  tags: candidate.tags,
                  questions: (
                    candidate.userVisiblePayload as {
                      questions?: GeneratedProblemCommon["questions"];
                    }
                  ).questions
                }) === hash
            );
          },
          embed: (t) => embedText(t),
          findSimilar: (embedding) =>
            findSimilarProblems({
              exerciseTypeId: exerciseType.id,
              embedding,
              k: cfg.dedup.neighborK
            }),
          embeddingText: (p) => problemEmbeddingText(p)
        }
      }));

    if (!saved?.outcome) remainingAttempts -= outcome.attemptsUsed;
    const { problem } = outcome.result;
    const hash = computeUniquenessHash({
      title: problem.title,
      promptText: problem.userVisiblePrompt,
      tags: problem.tags,
      questions: problem.questions
    });

    try {
      const generationPrompt = await loadActivePrompt({
        role: PromptRole.GENERATOR,
        exerciseSlug
      });

      const candidateId = saved?.candidateId ?? randomUUID();
      const checkpoint: GenerationCheckpoint = {
        kind: "generation",
        remainingAttempts,
        avoidanceHint,
        modelStep: jobContext.getStore()?.nextStep ?? 0,
        outcome,
        candidateId,
        promptId: saved?.promptId ?? generationPrompt.id,
        exerciseTypeId: saved?.exerciseTypeId ?? exerciseType.id,
        model:
          saved?.model ??
          (await prisma.modelRun.findUnique({ where: { id: outcome.result.modelRunId } }))?.model ??
          cfg.openai.model
      };
      await saveCheckpoint(job.id, job.leaseToken!, json(checkpoint));
      const created = await retryDatabaseOperation(() =>
        withJobLease(job, async (tx) => {
          // If a connection died after COMMIT, recover this exact candidate rather
          // than create another exercise or spend another model call.
          const committed = await tx.problem.findUnique({ where: { id: candidateId } });
          if (committed) {
            await tx.backgroundJob.update({
              where: { id: job.id },
              data: completeData({ problemId: committed.id })
            });
            return committed;
          }
          {
            const userVisiblePayload: Prisma.InputJsonValue = {
              title: problem.title,
              difficulty: problem.difficulty,
              timeboxMinutes: problem.timeboxMinutes,
              suggestedPacing: problem.suggestedPacing,
              userVisiblePrompt: problem.userVisiblePrompt,
              requiredAnswerSections: problem.requiredAnswerSections,
              rubric: problem.rubric,
              tags: problem.tags,
              // LSAT sets carry their questions here; other modes leave this undefined.
              ...(problem.questions ? { questions: problem.questions } : {})
            };

            const inserted = await tx.problem.create({
              data: {
                id: candidateId,
                exerciseTypeId: checkpoint.exerciseTypeId,
                title: problem.title,
                promptText: problem.userVisiblePrompt,
                userVisiblePayload,
                hiddenAnswerKey: problem.hiddenAnswerKey as Prisma.InputJsonValue,
                rubric: problem.rubric as unknown as Prisma.InputJsonValue,
                timeboxMinutes: problem.timeboxMinutes,
                suggestedPacing: problem.suggestedPacing as unknown as Prisma.InputJsonValue,
                requiredAnswerSections:
                  problem.requiredAnswerSections as unknown as Prisma.InputJsonValue,
                difficulty: problem.difficulty,
                tags: problem.tags,
                uniquenessHash: hash,
                isNearDuplicate: outcome.isNearDuplicate,
                nearestSimilarity: outcome.nearestSimilarity,
                generatedByModel: checkpoint.model,
                generationPromptVersionId: checkpoint.promptId!
              }
            });

            for (const c of problem.sourceCitations) {
              await tx.problemSource.create({
                data: {
                  problemId: inserted.id,
                  url: c.url,
                  title: c.title,
                  publisher: c.publisher
                }
              });
            }

            await tx.backgroundJob.update({
              where: { id: job.id },
              data: completeData({ problemId: inserted.id })
            });
            return inserted;
          }
        })
      );

      // Embeddings improve duplicate prevention but must never roll back an
      // otherwise valid exercise (e.g. vector dimension or extension failure).
      if (outcome.embedding) {
        try {
          const literal = `[${outcome.embedding.join(",")}]`;
          await prisma.$executeRaw`UPDATE "Problem" SET embedding = ${literal}::vector WHERE id = ${created.id}`;
        } catch (err) {
          console.error(`[generate] embedding for problem ${created.id} could not be stored:`, err);
        }
      }

      return;
    } catch (err) {
      // Two concurrent generations can pass the precheck before either commits.
      // The unique index is authoritative; spend only the remaining model budget.
      if (
        remainingAttempts > 0 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        err.meta.target.includes("uniquenessHash")
      ) {
        avoidanceHint = {
          ...avoidanceHint,
          recentTitles: [...avoidanceHint.recentTitles, problem.title],
          recentTags: [...avoidanceHint.recentTags, ...problem.tags],
          recentHashes: [...avoidanceHint.recentHashes, hash]
        };
        saved = {
          kind: "generation",
          remainingAttempts,
          avoidanceHint,
          modelStep: jobContext.getStore()?.nextStep ?? 0,
          exerciseTypeId: exerciseType.id,
          model: cfg.openai.model
        };
        await saveCheckpoint(job.id, job.leaseToken!, json(saved));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Generation retry budget exhausted");
}

type EvaluationCheckpoint = {
  kind: "evaluation";
  evaluation: import("@/lib/exercises/types").EvaluationCommon;
  evaluatorPromptVersionId: string;
  model: string;
  modelStep: number;
};

async function evaluate(job: BackgroundJob): Promise<void> {
  const { attemptId } = job.payload as { attemptId: number };
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId, userId: job.userId },
    include: { problem: { include: { exerciseType: true } }, evaluation: true }
  });
  if (!attempt) throw new Error("Saved attempt no longer exists");
  if (attempt.evaluation) {
    await finishJob(job.id, job.leaseToken!, { evaluationId: attempt.evaluation.id });
    return;
  }
  let checkpoint = job.checkpoint as unknown as EvaluationCheckpoint | null;
  if (!checkpoint) {
    const cfg = getConfig();
    const prompt = await loadActivePrompt({
      role: PromptRole.EVALUATOR,
      exerciseSlug: attempt.problem.exerciseType.slug
    });
    const problem = {
      ...(attempt.problem.userVisiblePayload as object),
      hiddenAnswerKey: attempt.problem.hiddenAnswerKey
    } as GeneratedProblemCommon;
    let result;
    try {
      result = await getMode(attempt.problem.exerciseType.slug).evaluate({
        problem,
        userAnswer: attempt.responseText
      });
    } catch (error) {
      // A JSON-valid response can still fail exercise-level rubric/question
      // checks. Do not replay that rejected response forever on manual retry.
      // Persistence/lease failures are different: retain any valid checkpoint.
      const step = (jobContext.getStore()?.nextStep ?? 0) - 1;
      if (step >= 0 && !(error instanceof Error && /^(Prisma|LeaseLost)/.test(error.name))) {
        await withJobLease(job, (tx) =>
          tx.modelRun.updateMany({
            where: { backgroundJobId: job.id, jobStep: step, status: "COMPLETED" },
            data: {
              status: "ERROR",
              error: `Exercise validation failed: ${error instanceof Error ? error.message : String(error)}`
            }
          })
        );
      }
      throw error;
    }
    checkpoint = {
      kind: "evaluation",
      evaluation: result.evaluation,
      evaluatorPromptVersionId: prompt.id,
      model:
        (await prisma.modelRun.findUnique({ where: { id: result.modelRunId } }))?.model ??
        cfg.openai.model,
      modelStep: jobContext.getStore()?.nextStep ?? 0
    };
    await saveCheckpoint(job.id, job.leaseToken!, json(checkpoint));
  }
  const saved = checkpoint;
  const e = saved.evaluation;
  await retryDatabaseOperation(() =>
    withJobLease(job, async (tx) => {
      let row = await tx.evaluation.findUnique({ where: { attemptId } });
      if (!row) {
        row = await tx.evaluation.create({
          data: {
            attemptId,
            evaluatorPromptVersionId: saved.evaluatorPromptVersionId,
            model: saved.model,
            overallScore: e.overallScore,
            shortDiagnosis: e.shortDiagnosis,
            summary: e.summary,
            topFixes: json(e.topFixes),
            rewriteSuggestions: json(e.rewriteSuggestions),
            strongAnswerSketch: e.strongAnswerSketch ?? null,
            nextRep: e.nextRep,
            clarificationQuestion: e.clarificationQuestion ?? null,
            errorPatternTags: e.errorPatternTags,
            missClassifications: e.missClassifications,
            rawOutput: json(e)
          }
        });
        for (const d of e.dimensions)
          await tx.evaluationDimension.create({
            data: {
              evaluationId: row.id,
              dimension: d.name,
              score: d.score,
              rationale: d.rationale,
              exampleResponse: d.exampleResponse ?? null
            }
          });
      }
      await tx.attempt.update({ where: { id: attemptId }, data: { status: "EVALUATED" } });
      await tx.backgroundJob.update({
        where: { id: job.id },
        data: completeData({ evaluationId: row.id })
      });
    })
  );
}

export async function processJob(job: BackgroundJob): Promise<void> {
  if (job.kind === "GENERATION") await generate(job);
  else await evaluate(job);
}
