import { ExerciseSlug } from "@prisma/client";
import type { ExerciseMode } from "@/lib/exercises/types";
import { IncidentGeneratedProblemSchema, IncidentEvaluationSchema } from "./schemas";
import { generateIncidentProblem } from "./generator";
import { evaluateIncidentAttempt } from "./evaluator";

export const incidentResponseMode: ExerciseMode = {
  slug: ExerciseSlug.INCIDENT_RESPONSE,
  generatedProblemSchema: IncidentGeneratedProblemSchema,
  evaluationSchema: IncidentEvaluationSchema,
  generate: generateIncidentProblem,
  evaluate: evaluateIncidentAttempt
};
