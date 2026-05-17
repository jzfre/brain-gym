import type { ExerciseSlug, Difficulty } from "@prisma/client";
import type { ZodType } from "zod";

export type GenerateInput = {
  difficulty: Difficulty;
  avoidanceHint: {
    recentTitles: string[];
    recentTags: string[];
    recentSourceUrls: string[];
    recentHashes: string[];
  };
};

export type GeneratedProblemCommon = {
  title: string;
  difficulty: Difficulty;
  timeboxMinutes: number;
  suggestedPacing: Array<{ label: string; minutes: number }>;
  userVisiblePrompt: string;
  requiredAnswerSections: Array<{ order: number; title: string; description?: string }>;
  hiddenAnswerKey: Record<string, unknown>;
  rubric: { dimensions: Array<{ name: string; maxScore: number; description: string }> };
  tags: string[];
  sourceCitations: Array<{ title: string; url: string; publisher?: string }>;
  duplicateAvoidanceKey: string;
};

export type EvaluationCommon = {
  overallScore: number;
  shortDiagnosis: string;
  dimensions: Array<{
    name: string;
    score: number;
    rationale: string;
    sharperVersion?: string;
    missingItems?: string[];
  }>;
  summary: string;
  topFixes: string[];
  rewriteSuggestions: Record<string, string | string[]>;
  strongAnswerSketch?: string;
  nextRep: string;
  clarificationQuestion?: string | null;
  errorPatternTags: string[];
  missClassifications: Array<
    | "english_comprehension"
    | "logic"
    | "question_type_confusion"
    | "too_strong"
    | "too_narrow"
    | "wrong_conclusion"
    | "quantifier_modal"
  >;
};

export type GenerateResult = {
  problem: GeneratedProblemCommon;
  modelRunId: string;
};

export type EvaluateInput = {
  problem: GeneratedProblemCommon;
  userAnswer: string;
};

export type EvaluateResult = {
  evaluation: EvaluationCommon;
  modelRunId: string;
};

export interface ExerciseMode {
  slug: ExerciseSlug;
  generatedProblemSchema: ZodType;
  evaluationSchema: ZodType;
  generate(input: GenerateInput): Promise<GenerateResult>;
  evaluate(input: EvaluateInput): Promise<EvaluateResult>;
}
