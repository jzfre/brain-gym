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

export type Choice = "A" | "B" | "C" | "D" | "E";

// One LSAT question as shown to the user (answer key stripped). A LSAT problem is
// a *set* of these; other modes leave `questions` undefined.
export type LsatPublicQuestion = {
  number: number;
  stimulus: string;
  questionStem: string;
  choices: Record<Choice, string>;
  questionType: string;
};

// Per-question result for a LSAT set, carried in the evaluation's rawOutput and
// rendered in the feedback panel and history.
export type LsatQuestionResult = {
  number: number;
  questionType: string;
  yourChoice: string;
  yourReasoning: string;
  correctChoice: string;
  isCorrect: boolean;
  explanation: string;
  reasoningCritique: string;
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
  // LSAT only: the set of questions (no answer key). Persisted into userVisiblePayload.
  questions?: LsatPublicQuestion[];
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
  // LSAT sets only: per-question breakdown. Stored in the evaluation's rawOutput
  // (no dedicated column) and read by the feedback panel / history.
  questions?: LsatQuestionResult[];
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
