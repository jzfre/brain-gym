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

export const MemoGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(1),
  userVisiblePrompt: z.string().min(50),
  requiredAnswerSections: z.array(AnswerSection).length(6),
  hiddenAnswerKey: z.object({
    idealClaim: z.string(),
    mustCiteEvidence: z.array(z.string()),
    keyAssumptions: z.array(z.string()),
    strongestTradeoffs: z.array(z.string()),
    sharpestNextTest: z.string(),
    mindChanger: z.string()
  }),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(6) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  exampleResponse: z.string().min(5),
  sharperVersion: z.string().nullable(),
  missingItems: z.array(z.string()).nullable()
});

export const MemoEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  // 6 for problems generated with the "What would change my mind" rubric
  // dimension; 5 keeps evaluation working for problems generated before it.
  dimensions: z.array(EvalDimension).min(5).max(6),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    improvedClaim: z.string(),
    missingAssumptions: z.array(z.string()).length(2),
    missingTradeoffs: z.array(z.string()).length(2),
    betterPhrasingForWeakEvidence: z.array(z.string())
  }),
  strongAnswerSketch: z.string().nullable(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type MemoGeneratedProblem = z.infer<typeof MemoGeneratedProblemSchema>;
export type MemoEvaluation = z.infer<typeof MemoEvaluationSchema>;
