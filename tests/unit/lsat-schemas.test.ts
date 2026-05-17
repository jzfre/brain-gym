import { describe, it, expect } from "vitest";
import { LsatGeneratedProblemSchema, LsatEvaluationSchema } from "@/lib/exercises/lsat-logical-reasoning/schemas";

const validProblem = {
  title: "Necessary Assumption — municipal budgets",
  difficulty: "MEDIUM",
  timeboxMinutes: 6,
  suggestedPacing: [
    { label: "read stimulus", minutes: 2 },
    { label: "prephrase", minutes: 1 },
    { label: "eliminate", minutes: 3 }
  ],
  userVisiblePrompt:
    "Stimulus... about municipal budgets and policy.\nQ: Which one of the following is required by the argument?\nA. ...\nB. ...\nC. ...\nD. ...\nE. ...",
  requiredAnswerSections: [
    { order: 1, title: "Choice" },
    { order: 2, title: "Reason" }
  ],
  hiddenAnswerKey: {
    correctChoice: "C",
    explanation: "Because the argument depends on this assumption.",
    distractorAnalyses: { A: "too strong", B: "irrelevant", C: "correct", D: "reversed", E: "out of scope" },
    questionType: "Necessary Assumption"
  },
  rubric: {
    dimensions: [
      { name: "Correctness", maxScore: 10, description: "" },
      { name: "Reasoning quality", maxScore: 5, description: "" },
      { name: "Error pattern recognition", maxScore: 5, description: "" }
    ]
  },
  tags: ["necessary-assumption", "municipal-budgets"],
  sourceCitations: [],
  duplicateAvoidanceKey: "na-municipal-budgets"
};

describe("LsatGeneratedProblemSchema", () => {
  it("accepts a valid LSAT question", () => {
    expect(LsatGeneratedProblemSchema.parse(validProblem)).toBeTruthy();
  });

  it("rejects hiddenAnswerKey without a valid choice", () => {
    const bad = JSON.parse(JSON.stringify(validProblem));
    bad.hiddenAnswerKey.correctChoice = "F";
    expect(() => LsatGeneratedProblemSchema.parse(bad)).toThrow();
  });
});

describe("LsatEvaluationSchema", () => {
  it("accepts a valid evaluation with miss classifications", () => {
    const ev = {
      overallScore: 4.0,
      shortDiagnosis: "Picked a too-strong distractor.",
      dimensions: [
        { name: "Correctness", score: 0, rationale: "wrong" },
        { name: "Reasoning quality", score: 2, rationale: "ok" },
        { name: "Error pattern recognition", score: 2, rationale: "ok" }
      ],
      summary: "Strong stimulus parse but missed the modal trap.",
      topFixes: ["Check modal scope"],
      rewriteSuggestions: { betterReason: "Because the conclusion needs..." },
      strongAnswerSketch: "...",
      nextRep: "5 NA reps focused on modal scope",
      clarificationQuestion: null,
      errorPatternTags: ["modal-trap"],
      missClassifications: ["too_strong", "quantifier_modal"]
    };
    expect(LsatEvaluationSchema.parse(ev)).toBeTruthy();
  });
});
