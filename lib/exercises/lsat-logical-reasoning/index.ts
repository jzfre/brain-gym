import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema, LsatEvaluationSchema } from "./schemas";
import { generateLsatProblem } from "./generator";
import { evaluateLsatAttempt } from "./evaluator";

export const lsatMode: ExerciseMode = {
  slug: ExerciseSlug.LSAT_LOGICAL_REASONING,
  generatedProblemSchema: LsatGeneratedProblemSchema,
  evaluationSchema: LsatEvaluationSchema,
  generate: generateLsatProblem,
  evaluate: evaluateLsatAttempt
};
