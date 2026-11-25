import { z } from "zod";
import { EVALUATOR_BOUNDARY } from "../contracts";
import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type {
  EvaluateInput,
  EvaluateResult,
  LsatQuestionResult,
  LsatPublicQuestion
} from "@/lib/exercises/types";
import { LsatEvaluationSchema, LsatUserAnswerSchema } from "./schemas";

const normChoice = (s: string | undefined) => (s ?? "").trim().toUpperCase();
const KeySchema = z.array(z.object({
  number: z.number().int().positive(),
  correctChoice: z.enum(["A", "B", "C", "D", "E"]),
  explanation: z.string(),
  questionType: z.string().optional()
})).min(1);

function assertUniqueNumbers(items: Array<{ number: number }>, label: string): void {
  if (new Set(items.map((item) => item.number)).size !== items.length) {
    throw new Error(`LSAT evaluation: duplicate question numbers in ${label}`);
  }
}

export async function evaluateLsatAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const publicQuestions = (input.problem.questions ?? []) as LsatPublicQuestion[];
  const key = KeySchema.parse((input.problem.hiddenAnswerKey as { answers?: unknown }).answers);
  assertUniqueNumbers(key, "answer key");
  assertUniqueNumbers(publicQuestions, "problem");
  const questionNumbers = new Set(publicQuestions.map((q) => q.number));
  if (key.length !== publicQuestions.length || key.some((k) => !questionNumbers.has(k.number))) {
    throw new Error("LSAT evaluation: answer key does not match problem questions");
  }
  // Invalid stored answers must fail visibly and remain retryable, not silently
  // turn into an empty submission and permanently record a zero score.
  const userAnswers = LsatUserAnswerSchema.parse(JSON.parse(input.userAnswer)).answers;
  assertUniqueNumbers(userAnswers, "submission");
  if (userAnswers.some((answer) => !questionNumbers.has(answer.number))) {
    throw new Error("LSAT evaluation: submission contains an unknown question");
  }

  const byNumber = <T extends { number: number }>(arr: T[]) => new Map(arr.map((x) => [x.number, x]));
  const pubByNum = byNumber(publicQuestions);
  const userByNum = byNumber(userAnswers);

  // The model writes explanations and reasoning critiques; it does NOT decide
  // correctness (we compute that from the answer key below).
  const modelPayload = {
    questions: key.map((k) => {
      const pub = pubByNum.get(k.number);
      const ua = userByNum.get(k.number);
      return {
        number: k.number,
        questionType: k.questionType ?? pub?.questionType ?? "",
        stimulus: pub?.stimulus ?? "",
        questionStem: pub?.questionStem ?? "",
        choices: pub?.choices ?? {},
        correctChoice: k.correctChoice,
        keyExplanation: k.explanation,
        userChoice: normChoice(ua?.choice),
        userReasoning: ua?.reasoning ?? ""
      };
    })
  };

  const result = await runStructured({
    purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: LsatEvaluationSchema,
    schemaName: "LsatEvaluation",
    timeoutMs: cfg.openai.evalTimeoutMs,
    input: [
      { role: "system", content: base.content },
      { role: "system", content: `${ev.content}\n\n${EVALUATOR_BOUNDARY}` },
      { role: "user", content: JSON.stringify(modelPayload, null, 2) }
    ]
  });

  const model = result.parsed;
  assertUniqueNumbers(model.questions, "model feedback");
  const modelByNum = byNumber(model.questions);
  if (key.some((k) => !modelByNum.has(k.number))) {
    throw new Error("LSAT evaluation: model feedback is missing questions");
  }

  // Deterministic correctness + per-question merge.
  const questions: LsatQuestionResult[] = key.map((k) => {
    const ua = userByNum.get(k.number);
    const m = modelByNum.get(k.number);
    const yourChoice = normChoice(ua?.choice);
    const correctChoice = normChoice(k.correctChoice);
    return {
      number: k.number,
      questionType: k.questionType ?? pubByNum.get(k.number)?.questionType ?? "",
      yourChoice,
      yourReasoning: ua?.reasoning ?? "",
      correctChoice,
      isCorrect: yourChoice !== "" && yourChoice === correctChoice,
      explanation: m?.explanation ?? k.explanation,
      reasoningCritique: m?.reasoningCritique ?? ""
    };
  });

  const total = questions.length || 1;
  const correctCount = questions.filter((q) => q.isCorrect).length;
  const overallScore = Math.round((correctCount / total) * 10 * 10) / 10;

  // Aggregate miss tags only for questions the deterministic grader marked wrong
  // (and only for real question numbers), so a model tag on a correct/phantom
  // question can't leak into the stored classifications.
  const missClassifications: string[] = Array.from(
    new Set(
      questions
        .filter((q) => !q.isCorrect)
        .map((q) => modelByNum.get(q.number)?.missClassification)
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    )
  );

  return {
    evaluation: {
      overallScore,
      shortDiagnosis: model.shortDiagnosis,
      summary: model.summary,
      topFixes: model.topFixes,
      rewriteSuggestions: {},
      strongAnswerSketch: null,
      nextRep: model.nextRep,
      clarificationQuestion: null,
      errorPatternTags: model.errorPatternTags,
      missClassifications,
      dimensions: [],
      questions
    },
    modelRunId: result.modelRunId
  };
}
