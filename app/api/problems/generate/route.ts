import { NextResponse } from "next/server";
import { z } from "zod";
import { Difficulty, ExerciseSlug, PromptRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";

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

  try {
    const mode = getMode(exerciseSlug);
    const avoidanceHint = await loadAvoidanceHint({ exerciseSlug });
    const cfg = getConfig();

    let { problem, modelRunId } = await mode.generate({ difficulty, avoidanceHint });
    let hash = computeUniquenessHash({
      title: problem.title,
      promptText: problem.userVisiblePrompt,
      tags: problem.tags
    });

    if (avoidanceHint.recentHashes.includes(hash)) {
      const augmented = {
        ...avoidanceHint,
        recentHashes: [...avoidanceHint.recentHashes, hash],
        recentTitles: [...avoidanceHint.recentTitles, problem.title]
      };
      const retry = await mode.generate({ difficulty, avoidanceHint: augmented });
      problem = retry.problem;
      modelRunId = retry.modelRunId;
      hash = computeUniquenessHash({
        title: problem.title,
        promptText: problem.userVisiblePrompt,
        tags: problem.tags
      });
    }

    const exerciseType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: exerciseSlug } });
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
          generatedByModel: cfg.openai.model,
          generationPromptVersionId: generationPrompt.id
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

      return inserted;
    });

    return NextResponse.json({ problemId: created.id, modelRunId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "generation_failed", message }, { status: 502 });
  }
}
