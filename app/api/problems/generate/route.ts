import { NextResponse } from "next/server";
import { z } from "zod";
import { Difficulty, ExerciseSlug, PromptRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { generateUniqueProblem } from "@/lib/memory/dedup";
import { embedText, problemEmbeddingText } from "@/lib/memory/embedding";
import { findSimilarProblems } from "@/lib/memory/similarity";
import { completeJob, createJob, failJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";

const Body = z.object({
  exerciseSlug: z.nativeEnum(ExerciseSlug),
  difficulty: z.nativeEnum(Difficulty)
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { exerciseSlug, difficulty } = parsed.data;

  // Generation (model call + dedup retries) can far exceed Cloudflare's 100s
  // proxy limit, so we don't await it — same pattern as the evaluate route.
  // The client polls GET /api/problems/generate/:jobId until the job settles.
  const jobId = createJob();
  void runGeneration(jobId, exerciseSlug, difficulty);
  return NextResponse.json({ jobId }, { status: 202 });
}

async function runGeneration(
  jobId: string,
  exerciseSlug: ExerciseSlug,
  difficulty: Difficulty
): Promise<void> {
  try {
    const mode = getMode(exerciseSlug);
    const avoidanceHint = await loadAvoidanceHint({ exerciseSlug });
    const cfg = getConfig();
    const exerciseType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: exerciseSlug } });

    const outcome = await generateUniqueProblem({
      input: { difficulty, avoidanceHint },
      config: { threshold: cfg.dedup.similarityThreshold, maxRetries: cfg.dedup.maxRetries },
      deps: {
        generate: (i) => mode.generate(i),
        embed: (t) => embedText(t),
        findSimilar: (embedding) =>
          findSimilarProblems({ exerciseTypeId: exerciseType.id, embedding, k: cfg.dedup.neighborK }),
        embeddingText: (p) => problemEmbeddingText(p)
      }
    });

    const { problem } = outcome.result;
    const hash = computeUniquenessHash({
      title: problem.title,
      promptText: problem.userVisiblePrompt,
      tags: problem.tags
    });

    const generationPrompt = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug });

    const created = await prisma.$transaction(async (tx) => {
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
          exerciseTypeId: exerciseType.id,
          title: problem.title,
          promptText: problem.userVisiblePrompt,
          userVisiblePayload,
          hiddenAnswerKey: problem.hiddenAnswerKey as Prisma.InputJsonValue,
          rubric: problem.rubric as unknown as Prisma.InputJsonValue,
          timeboxMinutes: problem.timeboxMinutes,
          suggestedPacing: problem.suggestedPacing as unknown as Prisma.InputJsonValue,
          requiredAnswerSections: problem.requiredAnswerSections as unknown as Prisma.InputJsonValue,
          difficulty: problem.difficulty,
          tags: problem.tags,
          uniquenessHash: hash,
          isNearDuplicate: outcome.isNearDuplicate,
          nearestSimilarity: outcome.nearestSimilarity,
          generatedByModel: cfg.openai.model,
          generationPromptVersionId: generationPrompt.id
        }
      });

      if (outcome.embedding) {
        const literal = `[${outcome.embedding.join(",")}]`;
        await tx.$executeRaw`UPDATE "Problem" SET embedding = ${literal}::vector WHERE id = ${inserted.id}`;
      }

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

      return inserted;
    });

    completeJob(jobId, created.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate] job ${jobId} failed:`, err);
    failJob(jobId, message);
  }
}
