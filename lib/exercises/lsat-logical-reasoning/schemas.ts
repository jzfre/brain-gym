import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const Choice = z.enum(["A", "B", "C", "D", "E"]);
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
  url: z.string().url(),
  publisher: z.string().nullable()
});

const HiddenAnswerKey = z.object({
  correctChoice: Choice,
  explanation: z.string().min(10),
  distractorAnalyses: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
    E: z.string()
  }),
  questionType: z.string().min(3)
});

export const LsatGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(2),
  userVisiblePrompt: z.string().min(50),
  requiredAnswerSections: z.array(AnswerSection).length(2),
  hiddenAnswerKey: HiddenAnswerKey,
  rubric: z.object({ dimensions: z.array(RubricDimension).length(3) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const MissClass = z.enum([
  "english_comprehension",
  "logic",
  "question_type_confusion",
  "too_strong",
  "too_narrow",
  "wrong_conclusion",
  "quantifier_modal"
]);

const EvalDimension = z.object({
  name: z.string(),
  score: z.number(),
  rationale: z.string(),
  sharperVersion: z.string().nullable(),
  missingItems: z.array(z.string()).nullable()
});

export const LsatEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  shortDiagnosis: z.string().min(5),
  dimensions: z.array(EvalDimension).length(3),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).min(1).max(3),
  rewriteSuggestions: z.object({ betterReason: z.string() }),
  strongAnswerSketch: z.string().nullable(),
  nextRep: z.string().min(3),
  clarificationQuestion: z.string().nullable(),
  errorPatternTags: z.array(z.string()).max(4),
  missClassifications: z.array(MissClass)
});

export type LsatGeneratedProblem = z.infer<typeof LsatGeneratedProblemSchema>;
export type LsatEvaluation = z.infer<typeof LsatEvaluationSchema>;
