import { NextResponse } from "next/server";
import { AttemptStatus, PromptRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import type { GeneratedProblemCommon } from "@/lib/exercises/types";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId)) {
    return NextResponse.json({ error: "invalid_attempt_id" }, { status: 400 });
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { problem: { include: { exerciseType: true } }, evaluation: true }
  });
  if (!attempt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (attempt.evaluation) {
    return NextResponse.json({ evaluationId: attempt.evaluation.id, alreadyEvaluated: true });
  }

  const cfg = getConfig();
  const mode = getMode(attempt.problem.exerciseType.slug);
  const evaluatorPrompt = await loadActivePrompt({
    role: PromptRole.EVALUATOR,
    exerciseSlug: attempt.problem.exerciseType.slug
  });

  const problemAsCommon = {
    ...(attempt.problem.userVisiblePayload as object),
    hiddenAnswerKey: attempt.problem.hiddenAnswerKey
  } as unknown as GeneratedProblemCommon;

  try {
    const result = await mode.evaluate({
      problem: problemAsCommon,
      userAnswer: attempt.responseText
    });

    const e = result.evaluation;
    const evaluation = await prisma.$transaction(async (tx) => {
      const row = await tx.evaluation.create({
        data: {
          attemptId,
          evaluatorPromptVersionId: evaluatorPrompt.id,
          model: cfg.openai.model,
          overallScore: e.overallScore,
          shortDiagnosis: e.shortDiagnosis,
          summary: e.summary,
          topFixes: e.topFixes as unknown as Prisma.InputJsonValue,
          rewriteSuggestions: e.rewriteSuggestions as unknown as Prisma.InputJsonValue,
          strongAnswerSketch: e.strongAnswerSketch ?? null,
          nextRep: e.nextRep,
          clarificationQuestion: e.clarificationQuestion ?? null,
          errorPatternTags: e.errorPatternTags,
          missClassifications: e.missClassifications,
          rawOutput: e as unknown as Prisma.InputJsonValue
        }
      });
      for (const d of e.dimensions) {
        await tx.evaluationDimension.create({
          data: { evaluationId: row.id, dimension: d.name, score: d.score, rationale: d.rationale }
        });
      }
      await tx.attempt.update({ where: { id: attemptId }, data: { status: AttemptStatus.EVALUATED } });
      return row;
    });

    return NextResponse.json({ evaluationId: evaluation.id });
  } catch (err) {
    await prisma.attempt.update({ where: { id: attemptId }, data: { status: AttemptStatus.EVAL_FAILED } });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "evaluation_failed", message }, { status: 502 });
  }
}
