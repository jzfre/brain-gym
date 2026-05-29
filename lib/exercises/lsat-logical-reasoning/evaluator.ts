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
import { LsatEvaluationSchema } from "./schemas";

type KeyAnswer = {
  number: number;
  correctChoice: string;
  explanation: string;
  distractorAnalyses?: Record<string, string>;
  questionType?: string;
};
type UserAnswer = { number: number; choice: string; reasoning: string };

const normChoice = (s: string | undefined) => (s ?? "").trim().toUpperCase();

function parseUserAnswers(raw: string): UserAnswer[] {
  try {
    const parsed = JSON.parse(raw) as { answers?: UserAnswer[] };
    if (Array.isArray(parsed.answers)) {
      return parsed.answers.map((a) => ({
        number: Number(a.number),
        choice: String(a.choice ?? ""),
        reasoning: String(a.reasoning ?? "")
      }));
    }
  } catch {
    /* fall through */
  }
  return [];
}

export async function evaluateLsatAttempt(input: EvaluateInput): Promise<EvaluateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const ev = await loadActivePrompt({ role: PromptRole.EVALUATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const publicQuestions = (input.problem.questions ?? []) as LsatPublicQuestion[];
  const key = ((input.problem.hiddenAnswerKey as { answers?: KeyAnswer[] }).answers ?? []) as KeyAnswer[];
  // No answer key → can't grade. Throw so the attempt is marked EVAL_FAILED and
  // retryable, rather than silently persisting a 0/10.
  if (key.length === 0) {
    throw new Error("LSAT evaluation: problem has no answer key to grade against");
  }
  const userAnswers = parseUserAnswers(input.userAnswer);

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
    input: [
      { role: "system", content: base.content },
      { role: "system", content: ev.content },
      { role: "user", content: JSON.stringify(modelPayload, null, 2) }
    ]
  });

  const model = result.parsed;
  const modelByNum = byNumber(model.questions);

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
