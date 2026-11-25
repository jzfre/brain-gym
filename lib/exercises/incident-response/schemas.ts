import { z } from "zod";
import { NonBlank, nonBlankText, TimeboxMinutes, PacingItem, AnswerSection, SourceCitation, INCIDENT_DIMENSIONS, validateGeneratedStructure } from "../contracts";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const RubricDimension = z.object({
  name: z.enum(INCIDENT_DIMENSIONS), maxScore: z.literal(10), description: NonBlank
});

export const IncidentGeneratedProblemSchema = z.object({
  title: nonBlankText(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: TimeboxMinutes,
  suggestedPacing: z.array(PacingItem).min(3),
  userVisiblePrompt: nonBlankText(200),
  requiredAnswerSections: z.array(AnswerSection).length(11),
  hiddenAnswerKey: z.object({
    primaryRootCause: NonBlank,
    containmentSteps: z.array(NonBlank).min(1),
    rejectedDangerousIdeas: z.array(NonBlank).min(1),
    expectedNumericRanges: z.array(z.object({ metric: NonBlank, range: NonBlank })).min(1)
  }),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(11) }),
  tags: z.array(NonBlank).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: nonBlankText(3)
}).superRefine(validateGeneratedStructure);

const EvalDimension = z.object({
  name: z.string(),
  score: z.number().finite().min(0),
  rationale: z.string(),
  sharperVersion: z.string().nullable(),
  missingItems: z.array(z.string()).nullable()
});

export const IncidentEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: nonBlankText(5),
  dimensions: z.array(EvalDimension).length(11),
  summary: nonBlankText(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    betterContainment: z.array(z.string()).min(1),
    betterCustomerPrioritization: z.string(),
    betterNumericalSanityCheck: z.string()
  }),
  strongAnswerSketch: z.string().nullable(),
  nextRep: nonBlankText(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type IncidentGeneratedProblem = z.infer<typeof IncidentGeneratedProblemSchema>;
export type IncidentEvaluation = z.infer<typeof IncidentEvaluationSchema>;
