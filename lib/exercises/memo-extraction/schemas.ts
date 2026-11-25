import { z } from "zod";
import { NonBlank, nonBlankText, TimeboxMinutes, PacingItem, AnswerSection, SourceCitation, MEMO_DIMENSIONS, validateGeneratedStructure } from "../contracts";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);

const RubricDimension = z.object({
  name: z.enum(MEMO_DIMENSIONS), maxScore: z.literal(10), description: NonBlank
});

export const MemoGeneratedProblemSchema = z.object({
  title: nonBlankText(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: TimeboxMinutes,
  suggestedPacing: z.array(PacingItem).min(1),
  userVisiblePrompt: nonBlankText(50),
  requiredAnswerSections: z.array(AnswerSection).length(6),
  hiddenAnswerKey: z.object({
    idealClaim: NonBlank,
    mustCiteEvidence: z.array(NonBlank).min(1),
    keyAssumptions: z.array(NonBlank).min(1),
    strongestTradeoffs: z.array(NonBlank).min(1),
    sharpestNextTest: NonBlank,
    mindChanger: NonBlank
  }),
  rubric: z.object({ dimensions: z.array(RubricDimension).length(6) }),
  tags: z.array(NonBlank).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: nonBlankText(3)
}).superRefine(validateGeneratedStructure);

const EvalDimension = z.object({
  name: z.string(),
  score: z.number().finite().min(0),
  rationale: z.string(),
  exampleResponse: nonBlankText(5),
  sharperVersion: z.string().nullable(),
  missingItems: z.array(z.string()).nullable()
});

export const MemoEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: nonBlankText(5),
  // 6 for problems generated with the "What would change my mind" rubric
  // dimension; 5 keeps evaluation working for problems generated before it.
  dimensions: z.array(EvalDimension).min(5).max(6),
  summary: nonBlankText(10),
  topFixes: z.array(z.string()).length(3),
  rewriteSuggestions: z.object({
    improvedClaim: z.string(),
    missingAssumptions: z.array(z.string()).length(2),
    missingTradeoffs: z.array(z.string()).length(2),
    betterPhrasingForWeakEvidence: z.array(z.string())
  }),
  strongAnswerSketch: z.string().nullable(),
  nextRep: nonBlankText(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(z.string()).length(0)
});

export type MemoGeneratedProblem = z.infer<typeof MemoGeneratedProblemSchema>;
export type MemoEvaluation = z.infer<typeof MemoEvaluationSchema>;
