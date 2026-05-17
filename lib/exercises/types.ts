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
  requiredAnswerSections: Array<{ order: number; title: string; description: string | null }>;
  hiddenAnswerKey: Record<string, unknown>;
  rubric: { dimensions: Array<{ name: string; maxScore: number; description: string }> };
  tags: string[];
  sourceCitations: Array<{ title: string; url: string; publisher: string | null }>;
  duplicateAvoidanceKey: string;
};

export type EvaluationCommon = {
  overallScore: number;
  shortDiagnosis: string;
  dimensions: Array<{
    name: string;
    score: number;
    rationale: string;
    sharperVersion: string | null;
    missingItems: string[] | null;
  }>;
  summary: string;
  topFixes: string[];
  rewriteSuggestions: Record<string, string | string[]>;
  strongAnswerSketch: string | null;
  nextRep: string;
  clarificationQuestion: string | null;
  errorPatternTags: string[];
  // Per-mode Zod schemas constrain this further (LSAT uses a union; memo/incident require [])
  missClassifications: string[];
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
