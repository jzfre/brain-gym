import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { MemoGeneratedProblemSchema, MemoEvaluationSchema } from "./schemas";
import { generateMemoProblem } from "./generator";
import { evaluateMemoAttempt } from "./evaluator";

export const memoExtractionMode: ExerciseMode = {
  slug: ExerciseSlug.MEMO_EXTRACTION,
  generatedProblemSchema: MemoGeneratedProblemSchema,
  evaluationSchema: MemoEvaluationSchema,
  generate: generateMemoProblem,
  evaluate: evaluateMemoAttempt
};
