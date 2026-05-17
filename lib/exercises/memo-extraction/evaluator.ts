import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { EvaluateInput, EvaluateResult } from "@/lib/exercises/types";
import { MemoEvaluationSchema } from "./schemas";

export async function evaluateMemoAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.MEMO_EXTRACTION });

  const userPayload = JSON.stringify(
    {
      problem: {
        title: input.problem.title,
        difficulty: input.problem.difficulty,
        userVisiblePrompt: input.problem.userVisiblePrompt,
        rubric: input.problem.rubric,
        requiredAnswerSections: input.problem.requiredAnswerSections
      },
      hiddenAnswerKey: input.problem.hiddenAnswerKey,
      userAnswer: input.userAnswer
    },
    null,
    2
  );

  const result = await runStructured({
    purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: MemoEvaluationSchema,
    schemaName: "MemoEvaluation",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: ev.content },
      { role: "user", content: userPayload }
    ]
  });

  return { evaluation: result.parsed, modelRunId: result.modelRunId };
}
