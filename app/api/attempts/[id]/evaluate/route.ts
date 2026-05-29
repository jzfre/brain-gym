import { NextResponse } from "next/server";
import { AttemptStatus, PromptRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getMode } from "@/lib/exercises/registry";
import { getConfig } from "@/lib/config";
import { loadActivePrompt } from "@/lib/prompts/registry";
import type { GeneratedProblemCommon } from "@/lib/exercises/types";

export const runtime = "nodejs";

// Attempts whose evaluation is running in this process. The client only triggers
// once, but this guards against a duplicate POST starting a second model call.
const inFlight = new Set<number>();

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId)) {
    return NextResponse.json({ error: "invalid_attempt_id" }, { status: 400 });
  }

  const existing = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { evaluation: true }
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.evaluation) {
    return NextResponse.json({ status: "evaluated", evaluationId: existing.evaluation.id });
  }
  if (inFlight.has(attemptId)) {
    return NextResponse.json({ status: "evaluating" }, { status: 202 });
  }

  // The model call can take well over Cloudflare's ~30s request cap, so we don't
  // await it here. The Node server is long-lived, so this promise runs to
  // completion and writes the result; the client polls GET /api/history/:id
  // until the evaluation row appears (or the attempt is marked EVAL_FAILED).
  inFlight.add(attemptId);
  void runEvaluation(attemptId).finally(() => inFlight.delete(attemptId));

  return NextResponse.json({ status: "evaluating" }, { status: 202 });
}

async function runEvaluation(attemptId: number): Promise<void> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { problem: { include: { exerciseType: true } }, evaluation: true }
  });
  if (!attempt || attempt.evaluation) return;

  const cfg = getConfig();
  try {
    const mode = getMode(attempt.problem.exerciseType.slug);
    const evaluatorPrompt = await loadActivePrompt({
      role: PromptRole.EVALUATOR,
      exerciseSlug: attempt.problem.exerciseType.slug
    });

    const problemAsCommon = {
      ...(attempt.problem.userVisiblePayload as object),
      hiddenAnswerKey: attempt.problem.hiddenAnswerKey
    } as unknown as GeneratedProblemCommon;

    const result = await mode.evaluate({
      problem: problemAsCommon,
      userAnswer: attempt.responseText
    });
    const e = result.evaluation;

    await prisma.$transaction(async (tx) => {
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
    });
  } catch {
    // Model/validation error: mark the attempt so the client can stop polling
    // and offer a retry. The failure detail is captured on the model_runs row.
    await prisma.attempt
      .update({ where: { id: attemptId }, data: { status: AttemptStatus.EVAL_FAILED } })
      .catch(() => {});
  }
}
