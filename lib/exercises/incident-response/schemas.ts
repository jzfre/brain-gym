import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const PacingItem = z.object({ label: z.string(), minutes: z.number().int().positive() });
const AnswerSection = z.object({
  order: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable()
});
const RubricDimension = z.object({
  name: z.string(),
  maxScore: z.number().positive(),
  description: z.string()
});
const SourceCitation = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable()
});

export const IncidentGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(3),
  userVisiblePrompt: z.string().min(200),
  requiredAnswerSections: z.array(AnswerSection).length(11),
  hiddenAnswerKey: z.object({
    primaryRootCause: z.string(),
    containmentSteps: z.array(z.string()),
    rejectedDangerousIdeas: z.array(z.string()),
    expectedNumericRanges: z.array(z.object({ metric: z.string(), range: z.string() }))
  }),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(11) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  sharperVersion: z.string().nullable(),
  missingItems: z.array(z.string()).nullable()
});

export const IncidentEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  dimensions: z.array(EvalDimension).length(11),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    betterContainment: z.array(z.string()).min(1),
    betterCustomerPrioritization: z.string(),
    betterNumericalSanityCheck: z.string()
  }),
  strongAnswerSketch: z.string().nullable(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type IncidentGeneratedProblem = z.infer<typeof IncidentGeneratedProblemSchema>;
export type IncidentEvaluation = z.infer<typeof IncidentEvaluationSchema>;
